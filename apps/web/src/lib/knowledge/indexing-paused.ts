import { inAboutHours, localClockTime } from '@parbot/shared';

/** What a source says when the AI provider's daily limit stopped its run. */
export const INDEXING_PAUSED =
  "Indexing paused: the AI provider's daily limit for this deployment is used up.";

const STORED =
  /^Indexing paused: the AI provider's daily limit for this deployment is used up\. It resets at (\S+); re-index after that\.$/;

/**
 * The sentence stored on the source row. The reset is kept as an exact moment, which each screen
 * words for its reader (their own clock in a browser); stored as "in 7 hours" it would go stale
 * while the row sits there.
 */
export const indexingPausedError = (resetAt: Date) =>
  `${INDEXING_PAUSED} It resets at ${resetAt.toISOString()}; re-index after that.`;

/** When the limit that paused a source resets, or null when its error is anything else. */
export const pausedUntil = (error: string | null | undefined): Date | null => {
  const stored = error ? STORED.exec(error)?.[1] : undefined;
  const at = stored ? new Date(stored) : null;

  return at && !Number.isNaN(at.getTime()) ? at : null;
};

export type SourceErrorOptions = {
  now?: Date;
  /** The reader's clock is known: in the browser, once the page has hydrated. */
  local?: boolean;
  /** For tests. */
  timeZone?: string;
};

/**
 * A source's error as a reader sees it. A paused run names its reset on the reader's own clock,
 * or in hours from now where that clock is not known yet, and says so once the limit has reset.
 * Every other error is shown as stored: the ingest already phrased it for people.
 */
export const sourceErrorText = (
  error: string,
  { now = new Date(), local = false, timeZone }: SourceErrorOptions = {},
) => {
  const resetAt = pausedUntil(error);

  if (!resetAt) {
    return error;
  }

  if (resetAt <= now) {
    return "Indexing paused: the AI provider's daily limit for this deployment was used up. It has reset since; re-index to continue.";
  }

  if (!local) {
    return `${INDEXING_PAUSED} It resets ${inAboutHours(resetAt, now)}; re-index after that.`;
  }

  const { time, tomorrow } = localClockTime(resetAt, now, timeZone);

  return `${INDEXING_PAUSED} It resets ${tomorrow ? 'tomorrow ' : ''}at ${time} your time; re-index after that.`;
};
