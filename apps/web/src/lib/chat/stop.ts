import {
  type AppStopRequest,
  type Citation,
  citedIndexes,
  MAX_STOP_TEXT_LENGTH,
} from '@parbot/shared';

import type { Json } from '@/lib/db/types';

import { parseCitations } from './thread';

export type StopInput = {
  assistantId: string;
  conversationId: string;
  /** The id the answer is saved under; the client proposed it with the question. */
  messageId: string;
  /** What the reader had been shown when they pressed Stop. */
  text: string;
};

/** A request with a body this small can outlive the page (keepalive caps a body at 64 KiB). */
const KEEPALIVE_BYTES = 60_000;
export const STOP_RETRY_MS = 800;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tells the server the reader stopped an answer. Aborting the stream is not enough: a serverless
 * host never passes the dropped connection on, so the answer would be saved in full and counted.
 * The UI never waits on this. A network failure or a server error is tried once more; a refusal
 * (4xx) is final. Resolves to whether the server recorded the stop.
 */
export const recordStop = async (input: StopInput): Promise<boolean> => {
  const body: AppStopRequest = {
    assistantId: input.assistantId,
    conversationId: input.conversationId,
    // A cut text is still a prefix of the answer, which is all the server keeps anyway.
    text: input.text.slice(0, MAX_STOP_TEXT_LENGTH),
  };
  const payload = JSON.stringify(body);
  const keepalive = new TextEncoder().encode(payload).length < KEEPALIVE_BYTES;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) {
      await wait(STOP_RETRY_MS);
    }

    try {
      const response = await fetch(`/api/messages/${input.messageId}/stop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive,
      });

      if (response.ok) {
        return true;
      }

      if (response.status < 500) {
        return false;
      }
    } catch {
      // Offline for a moment, or the page is going away: one more try.
    }
  }

  return false;
};

/** Reads a saved answer's citations; null while the answer is not saved (yet). */
export type SavedAnswerReader = (messageId: string) => Promise<{ citations: Json } | null>;

/**
 * When to look for a stopped answer once its stop is recorded. The engine looks for stops every
 * 400 ms while it answers and saves the stopped text right after it finds one; a stop that came
 * after the save has already been applied by the time the stop request answers.
 */
export const STOPPED_ANSWER_DELAYS_MS = [0, 300, 600, 1200, 2400, 4800];

/**
 * The citations a stopped answer carries, as a reload shows them. Citations reach the client
 * with the end of the stream, which a stopped answer never gets to, but the server saves the
 * stopped text with the passages its markers point at. They are read back once the stop has
 * settled, and only the ones the shown text cites are kept. Resolves to null when the text cites
 * nothing (nothing is read) or the saved answer never shows up.
 */
export const readStoppedCitations = async (
  read: SavedAnswerReader,
  messageId: string,
  shown: string,
  delays: readonly number[] = STOPPED_ANSWER_DELAYS_MS,
): Promise<Citation[] | null> => {
  const cited = new Set(citedIndexes(shown, Number.MAX_SAFE_INTEGER));

  if (cited.size === 0) {
    return null;
  }

  for (const delay of delays) {
    if (delay > 0) {
      await wait(delay);
    }

    // A failed read is tried again at the next step, like an answer not saved yet.
    const row = await read(messageId).catch(() => null);

    if (row) {
      return parseCitations(row.citations).filter((citation) => cited.has(citation.index));
    }
  }

  return null;
};
