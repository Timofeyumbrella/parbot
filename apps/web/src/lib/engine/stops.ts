import { citedIndexes } from '@parbot/shared';

import type { Json } from '@/lib/db/types';

import type { ServiceClient } from './retrieval';

/**
 * Stop is a request of its own. On a serverless host the reader's disconnect never reaches the
 * function that streams the answer, so the client records the stop in `message_stops` and the
 * engine looks for it: every STOP_POLL_MS while it answers, once more before it saves, and once
 * after. A stop that lands after all of that turns the saved answer into a stopped one here.
 */

/** How often the engine looks for a stop while it answers: a cheap primary key read. */
export const STOP_POLL_MS = 400;

/** One answer: the id it is saved under and the conversation and assistant it belongs to. */
export type StopTarget = { messageId: string; conversationId: string; assistantId: string };

/** A recorded stop: what the reader had been shown when they pressed Stop. */
export type StopRecord = { content: string };

/** The stop recorded for an answer, if any. A failed read counts as no stop. */
export const findStop = async (
  service: ServiceClient,
  target: StopTarget,
): Promise<StopRecord | null> => {
  try {
    const { data, error } = await service
      .from('message_stops')
      .select('content')
      .eq('message_id', target.messageId)
      .eq('conversation_id', target.conversationId)
      .eq('assistant_id', target.assistantId)
      .maybeSingle();

    if (error) {
      console.error('[engine] a stop could not be read', error);

      return null;
    }

    return data;
  } catch (cause) {
    console.error('[engine] a stop could not be read', cause);

    return null;
  }
};

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

/**
 * The part of an answer the reader saw. Tokens arrive in order, so what they were shown is a
 * prefix of what the server produced; taking the common prefix also means a client can shorten
 * an answer but never put words in the assistant's mouth.
 */
export const shownPart = (answer: string, shown: string) => {
  const produced = answer.trimStart();
  const seen = shown.trimStart();
  const limit = Math.min(produced.length, seen.length);
  let length = 0;

  while (length < limit && produced.charCodeAt(length) === seen.charCodeAt(length)) {
    length += 1;
  }

  // Never end on half of a character that takes two code units.
  if (length > 0 && isHighSurrogate(produced.charCodeAt(length - 1))) {
    length -= 1;
  }

  return produced.slice(0, length).trimEnd();
};

/** The stored citations a shortened answer still cites. */
export const citationsWithin = (content: string, citations: Json): Json[] => {
  if (!Array.isArray(citations)) {
    return [];
  }

  const cited = new Set(citedIndexes(content, Number.MAX_SAFE_INTEGER));

  return citations.filter(
    (citation) =>
      citation !== null &&
      typeof citation === 'object' &&
      !Array.isArray(citation) &&
      cited.has(Number(citation.index)),
  );
};

/**
 * What happened to a saved answer when a stop arrived late: `stopped` when a finished answer
 * became a stopped one and its slot was given back, `trimmed` when a stopped answer was cut back
 * to what the reader saw, `unchanged` when there was nothing to do, `none` when no answer is saved.
 */
export type SavedStopOutcome = 'stopped' | 'trimmed' | 'unchanged' | 'none';

/**
 * Makes a saved answer match a stop that arrived after it was written: the text the reader saw,
 * the citations that text still carries and `answered` null, with the month's slot given back.
 * An answer the reader saw none of is removed, as the engine does when the stop comes first.
 *
 * The stop routes and the engine may both run this for one answer. Each write only applies while
 * the row is still in the state it was read in (finished, or already stopped), so exactly one of
 * them turns a finished answer into a stopped one and gives the slot back.
 */
export const settleSavedStop = async (
  service: ServiceClient,
  target: StopTarget,
  shown: string,
): Promise<SavedStopOutcome> => {
  const { data: row, error } = await service
    .from('messages')
    .select('content, citations, answered, owner_id')
    .eq('id', target.messageId)
    .eq('conversation_id', target.conversationId)
    .eq('assistant_id', target.assistantId)
    .eq('role', 'assistant')
    .maybeSingle();

  if (error) {
    console.error('[engine] a stopped answer could not be read', error);

    return 'none';
  }

  if (!row) {
    return 'none';
  }

  const content = shownPart(row.content, shown);
  const finished = row.answered !== null;

  if (!finished && content === row.content) {
    return 'unchanged';
  }

  const write = content
    ? service
        .from('messages')
        .update({
          content,
          citations: citationsWithin(content, row.citations),
          answered: null,
        })
        .eq('id', target.messageId)
    : service.from('messages').delete().eq('id', target.messageId);
  const { data: changed, error: writeError } = await (
    finished ? write.not('answered', 'is', null) : write.is('answered', null)
  ).select('id');

  if (writeError) {
    console.error('[engine] a stopped answer could not be saved', writeError);

    return 'none';
  }

  if (!changed?.length) {
    return 'unchanged';
  }

  if (!finished) {
    return 'trimmed';
  }

  const { error: releaseError } = await service.rpc('release_message', { owner: row.owner_id });

  if (releaseError) {
    console.error('[engine] a stopped answer could not be unmetered', releaseError);
  }

  return 'stopped';
};

export type StopWatch = {
  /** Aborted as soon as a stop is found. */
  readonly signal: AbortSignal;
  /** The stop found so far, if any. */
  readonly found: StopRecord | null;
  /** Looks for the stop now, unless one was already found. */
  check(): Promise<StopRecord | null>;
  /** Stops looking. Safe to call more than once. */
  dispose(): void;
};

/**
 * Looks for a stop right away and then every `intervalMs` until one is found or the watch is
 * disposed. Runs beside the answer rather than between tokens, so a model that is slow to start
 * can still be stopped, and a token never waits on the database.
 */
export const watchForStop = (
  read: () => Promise<StopRecord | null>,
  intervalMs = STOP_POLL_MS,
): StopWatch => {
  const controller = new AbortController();
  let found: StopRecord | null = null;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const check = async () => {
    if (found) {
      return found;
    }

    const stop = await read();

    if (stop && !found) {
      found = stop;
      controller.abort();
    }

    return found;
  };

  const tick = async () => {
    await check();

    if (!disposed && !found) {
      timer = setTimeout(() => void tick(), intervalMs);
    }
  };

  void tick();

  return {
    signal: controller.signal,
    get found() {
      return found;
    },
    check,
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
};
