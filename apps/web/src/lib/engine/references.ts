import { MAX_REFERENCES } from '@parbot/shared';

import type { Enums } from '@/lib/db';

import type { ServiceClient } from './retrieval';

/**
 * References: the sources a reader points the in-app chat at, with @ or by attaching a file. They
 * belong to the conversation: a question that sends a list replaces them, one that sends none keeps
 * them, so a follow-up ("and on the free plan?") still reads the file the first question named.
 */

/** What a question was asked with, as stored on the reader's message and shown as its chips. */
export type SourceReference = { id: string; title: string; kind: Enums<'source_kind'> };

export type ReferencedSource = SourceReference & { status: Enums<'source_status'> };

/** How long an answer waits for a referenced file that is still being indexed. */
export const REFERENCE_WAIT_MS = 20_000;
export const REFERENCE_POLL_MS = 400;

export const isIndexing = (status: Enums<'source_status'>) =>
  status === 'queued' || status === 'crawling' || status === 'indexing';

/** The thinking state's line while the answer waits for files: "Reading guide.pdf…". */
export const readingMessage = (waiting: Pick<SourceReference, 'title'>[]) => {
  const [first] = waiting;

  if (!first) {
    return 'Reading the files…';
  }

  return waiting.length === 1
    ? `Reading ${first.title}…`
    : `Reading ${first.title} and ${waiting.length - 1} more…`;
};

export const toSourceReference = ({ id, title, kind }: SourceReference): SourceReference => ({
  id,
  title,
  kind,
});

const SOURCE_COLUMNS = 'id, title, kind, status';

/**
 * The requested ids that are this assistant's own sources, in the order they were asked for.
 * Anything else (another assistant's source, a deleted one, a made-up id) is left out: the
 * assistant was looked up with the reader's session, so its id is one they own.
 */
export const loadRequestedReferences = async (
  service: ServiceClient,
  assistantId: string,
  requested: string[],
): Promise<ReferencedSource[]> => {
  const ids = [...new Set(requested)].slice(0, MAX_REFERENCES);

  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await service
    .from('sources')
    .select(SOURCE_COLUMNS)
    .eq('assistant_id', assistantId)
    .in('id', ids);

  if (error) {
    throw new Error(`The referenced sources could not be read: ${error.message}`);
  }

  const byId = new Map((data ?? []).map((row) => [row.id, row]));

  return ids.flatMap((id) => {
    const row = byId.get(id);

    return row ? [row] : [];
  });
};

/** The conversation's references, in the order the reader added them. */
export const loadConversationReferences = async (
  service: ServiceClient,
  conversationId: string,
): Promise<ReferencedSource[]> => {
  const { data, error } = await service
    .from('conversation_references')
    .select(`position, sources(${SOURCE_COLUMNS})`)
    .eq('conversation_id', conversationId)
    .order('position', { ascending: true });

  if (error) {
    throw new Error(`The conversation's references could not be read: ${error.message}`);
  }

  return (data ?? []).flatMap((row) => (row.sources ? [row.sources] : []));
};

/** Makes `references` the conversation's references, and nothing else. */
export const saveConversationReferences = async (
  service: ServiceClient,
  target: { conversationId: string; assistantId: string; ownerId: string },
  references: SourceReference[],
) => {
  const ids = references.map((reference) => reference.id);
  let removal = service
    .from('conversation_references')
    .delete()
    .eq('conversation_id', target.conversationId);

  if (ids.length > 0) {
    removal = removal.not('source_id', 'in', `(${ids.join(',')})`);
  }

  // The two touch different rows, so they run side by side.
  const [removed, added] = await Promise.all([
    removal,
    ids.length > 0
      ? service.from('conversation_references').upsert(
          references.map((reference, position) => ({
            conversation_id: target.conversationId,
            source_id: reference.id,
            assistant_id: target.assistantId,
            owner_id: target.ownerId,
            position,
          })),
          { onConflict: 'conversation_id,source_id' },
        )
      : Promise.resolve({ error: null }),
  ]);
  const error = removed.error ?? added.error;

  if (error) {
    throw new Error(`The conversation's references could not be saved: ${error.message}`);
  }
};

export type ResolveReferencesInput = {
  assistantId: string;
  ownerId: string;
  conversationId: string;
  /** What the question sent: a list replaces the conversation's references, undefined keeps them. */
  requested: string[] | undefined;
  /** False for a conversation this request creates, which has nothing stored yet. */
  existing: boolean;
};

/**
 * The references this question is answered with. A failure to read or store them is logged and
 * the question is answered without them: an answer from the whole knowledge beats no answer.
 */
export const resolveReferences = async (
  service: ServiceClient,
  input: ResolveReferencesInput,
): Promise<ReferencedSource[]> => {
  try {
    if (input.requested === undefined) {
      return input.existing ? await loadConversationReferences(service, input.conversationId) : [];
    }

    const references = await loadRequestedReferences(service, input.assistantId, input.requested);

    await saveConversationReferences(service, input, references);

    return references;
  } catch (cause) {
    console.error('[engine] references could not be resolved', cause);

    return [];
  }
};

const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();

      return;
    }

    const timer = setTimeout(done, ms);

    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }

    signal?.addEventListener('abort', done, { once: true });
  });

/**
 * Waits for referenced sources that are still being indexed, up to `timeoutMs`, and returns the
 * references with the statuses they ended on. A file uploaded from the composer a moment ago is
 * usually ready within a second or two; one that takes longer is answered around.
 */
export const waitForReferences = async (
  service: ServiceClient,
  references: ReferencedSource[],
  options: { timeoutMs: number; pollMs?: number; signal?: AbortSignal },
): Promise<ReferencedSource[]> => {
  const deadline = Date.now() + options.timeoutMs;
  const pollMs = options.pollMs ?? REFERENCE_POLL_MS;
  let current = references;

  while (
    current.some((reference) => isIndexing(reference.status)) &&
    Date.now() < deadline &&
    !options.signal?.aborted
  ) {
    await pause(Math.min(pollMs, Math.max(deadline - Date.now(), 0)), options.signal);

    const waiting = current.filter((reference) => isIndexing(reference.status));
    const { data, error } = await service
      .from('sources')
      .select('id, status')
      .in(
        'id',
        waiting.map((reference) => reference.id),
      );

    if (error) {
      console.error('[engine] referenced sources could not be checked', error);
      break;
    }

    const statuses = new Map((data ?? []).map((row) => [row.id, row.status]));

    current = current.map((reference) => {
      if (!isIndexing(reference.status)) {
        return reference;
      }

      // A source deleted while the answer waited has nothing left to read.
      const status = statuses.get(reference.id) ?? 'failed';

      return status === reference.status ? reference : { ...reference, status };
    });
  }

  return current;
};
