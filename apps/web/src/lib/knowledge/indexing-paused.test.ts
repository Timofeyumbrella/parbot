import { answersPausedMessage, inAboutHours, localClockTime } from '@parbot/shared';
import { describe, expect, it } from 'vitest';

import { indexingPausedError, pausedUntil, sourceErrorText } from './indexing-paused';

// 19:27 PDT on Sep 27; the daily limit resets at midnight Pacific, 07:00 UTC.
const NOW = new Date('2026-09-28T02:27:00Z');
const RESET = new Date('2026-09-28T07:00:00Z');

describe('the stored sentence for a paused run', () => {
  it('keeps the reset as an exact moment that reads back', () => {
    const stored = indexingPausedError(RESET);

    expect(stored).toBe(
      "Indexing paused: the AI provider's daily limit for this deployment is used up. It resets at 2026-09-28T07:00:00.000Z; re-index after that.",
    );
    expect(pausedUntil(stored)).toEqual(RESET);
  });

  it('is not mistaken for any other error', () => {
    expect(pausedUntil('The embedding model is busy right now. Re-index in a few minutes.')).toBe(
      null,
    );
    expect(pausedUntil(null)).toBeNull();
    expect(
      pausedUntil(
        "Indexing paused: the AI provider's daily limit for this deployment is used up. It resets at soon; re-index after that.",
      ),
    ).toBeNull();
  });
});

describe('sourceErrorText', () => {
  const stored = indexingPausedError(RESET);

  it("puts the reset on the reader's clock once it is known", () => {
    expect(sourceErrorText(stored, { now: NOW, local: true, timeZone: 'Europe/Berlin' })).toBe(
      "Indexing paused: the AI provider's daily limit for this deployment is used up. It resets at 9:00 AM your time; re-index after that.",
    );
    expect(
      sourceErrorText(stored, { now: NOW, local: true, timeZone: 'America/Los_Angeles' }),
    ).toBe(
      "Indexing paused: the AI provider's daily limit for this deployment is used up. It resets tomorrow at 12:00 AM your time; re-index after that.",
    );
  });

  it('says it in hours where the clock is not known, as on the server', () => {
    expect(sourceErrorText(stored, { now: NOW })).toBe(
      "Indexing paused: the AI provider's daily limit for this deployment is used up. It resets in about 5 hours; re-index after that.",
    );
  });

  it('says so once the limit has reset', () => {
    expect(sourceErrorText(stored, { now: new Date('2026-09-28T08:00:00Z'), local: true })).toBe(
      "Indexing paused: the AI provider's daily limit for this deployment was used up. It has reset since; re-index to continue.",
    );
  });

  it('shows every other error as stored', () => {
    const other = 'Could not fetch https://x.test/: HTTP 404.';

    expect(sourceErrorText(other, { now: NOW, local: true })).toBe(other);
  });

  it('never names the provider, a model or a quota', () => {
    for (const local of [true, false]) {
      expect(sourceErrorText(stored, { now: NOW, local })).not.toMatch(
        /gemini|google|quota|429|RESOURCE_EXHAUSTED|UTC|Z;/i,
      );
    }
  });
});

describe('the shared wording of a reset', () => {
  it('counts hours from now, rounded, for a reader whose clock is unknown', () => {
    expect(inAboutHours(RESET, NOW)).toBe('in about 5 hours');
    expect(inAboutHours(new Date(NOW.getTime() + 70 * 60_000), NOW)).toBe('in about an hour');
    expect(inAboutHours(new Date(NOW.getTime() + 20 * 60_000), NOW)).toBe('in less than an hour');
  });

  it('tells today from tomorrow on the reader clock', () => {
    expect(localClockTime(RESET, NOW, 'Asia/Tokyo')).toEqual({ time: '4:00 PM', tomorrow: false });
    expect(localClockTime(RESET, NOW, 'America/New_York')).toEqual({
      time: '3:00 AM',
      tomorrow: true,
    });
  });

  it('writes the chat and widget sentence with the time the answers resume', () => {
    expect(answersPausedMessage(RESET.toISOString(), NOW, 'Europe/Berlin')).toBe(
      "Answers are paused: the AI provider's daily limit for this deployment is used up. Try again after 9:00 AM.",
    );
    expect(answersPausedMessage(RESET.toISOString(), NOW, 'America/New_York')).toBe(
      "Answers are paused: the AI provider's daily limit for this deployment is used up. Try again tomorrow after 3:00 AM.",
    );
    expect(answersPausedMessage(undefined, NOW)).toBe(
      "Answers are paused: the AI provider's daily limit for this deployment is used up. Try again later.",
    );
    expect(answersPausedMessage('2026-09-28T01:00:00Z', NOW)).toMatch(/Try again in a moment\.$/);
  });
});
