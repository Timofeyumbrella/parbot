import { type AppStopRequest, MAX_STOP_TEXT_LENGTH } from '@parbot/shared';

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
