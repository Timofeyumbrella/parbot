// @vitest-environment node
import { ApiError } from '@google/genai';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DAILY_CHAT_QUOTA,
  DAILY_EMBED_QUOTA,
  MINUTE_CHAT_QUOTA,
  MINUTE_EMBED_QUOTA,
  quotaApiError,
  quotaBody,
} from './quota.fixtures';
import {
  activeDailyLimit,
  clearDailyLimit,
  durationMs,
  forgetDailyLimits,
  nextDailyReset,
  noteDailyLimit,
  parseQuotaRefusal,
} from './quota';

/** A refusal with another status, as the SDK throws it. */
const apiError = (body: unknown, status = 429) =>
  new ApiError({ message: JSON.stringify(body), status });

describe('parseQuotaRefusal', () => {
  it('reads the daily cap and the suggested delay from a Gemini 429', () => {
    expect(parseQuotaRefusal(quotaApiError())).toEqual({
      scope: 'day',
      retryDelayMs: 37_000,
      quotaId: DAILY_EMBED_QUOTA,
    });
  });

  it('reads a per-minute quota as a burst', () => {
    expect(
      parseQuotaRefusal(
        quotaApiError({ violations: [{ quotaId: MINUTE_EMBED_QUOTA }], retryDelay: '12.5s' }),
      ),
    ).toEqual({ scope: 'minute', retryDelayMs: 12_500, quotaId: MINUTE_EMBED_QUOTA });
  });

  it('reads the body a stream sends after its status', () => {
    const body = quotaBody({
      violations: [
        {
          quotaId: MINUTE_CHAT_QUOTA,
          quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
        },
      ],
      retryDelay: '4s',
    });
    const streamed = new ApiError({
      message: `got status: RESOURCE_EXHAUSTED. ${JSON.stringify(body)}`,
      status: 429,
    });

    expect(parseQuotaRefusal(streamed)).toEqual({
      scope: 'minute',
      retryDelayMs: 4000,
      quotaId: MINUTE_CHAT_QUOTA,
    });
  });

  it('takes the daily cap over a per-minute quota named beside it', () => {
    const error = quotaApiError({
      violations: [{ quotaId: MINUTE_CHAT_QUOTA }, { quotaId: DAILY_CHAT_QUOTA }],
    });

    expect(parseQuotaRefusal(error)).toMatchObject({ scope: 'day', quotaId: DAILY_CHAT_QUOTA });
  });

  it('knows a daily cap by its metric when the id says nothing', () => {
    const error = quotaApiError({
      violations: [
        {
          quotaId: 'FreeTierRequests',
          quotaMetric: 'generativelanguage.googleapis.com/embed_content_requests_per_day',
        },
      ],
    });

    expect(parseQuotaRefusal(error)).toMatchObject({ scope: 'day', quotaId: 'FreeTierRequests' });
  });

  it('counts a bare 429 as a burst with no delay, and falls back to the message for one', () => {
    expect(
      parseQuotaRefusal(
        apiError({
          error: {
            code: 429,
            message: 'Resource has been exhausted (e.g. check quota).',
            status: 'RESOURCE_EXHAUSTED',
          },
        }),
      ),
    ).toEqual({ scope: 'minute', retryDelayMs: null, quotaId: null });
    expect(
      parseQuotaRefusal(
        apiError({
          error: { code: 429, message: 'Quota exceeded. Please retry in 2.25s.', details: [] },
        }),
      ),
    ).toMatchObject({ retryDelayMs: 2250 });
  });

  it('reads the fields by pattern when the JSON was cut short', () => {
    const text = JSON.stringify(quotaBody()).slice(0, -3);

    expect(parseQuotaRefusal(new ApiError({ message: text, status: 429 }))).toEqual({
      scope: 'day',
      retryDelayMs: 37_000,
      quotaId: DAILY_EMBED_QUOTA,
    });
  });

  it('reads a body handed over as it is, alone or in an array', () => {
    expect(parseQuotaRefusal(quotaBody())).toMatchObject({ scope: 'day' });
    expect(
      parseQuotaRefusal([quotaBody({ violations: [{ quotaId: MINUTE_EMBED_QUOTA }] })]),
    ).toMatchObject({ scope: 'minute' });
  });

  it('ignores everything that is not a quota refusal', () => {
    expect(
      parseQuotaRefusal(apiError({ error: { code: 503, message: 'Overloaded' } }, 503)),
    ).toBeNull();
    expect(
      parseQuotaRefusal(apiError({ error: { code: 400, message: 'Bad request' } }, 400)),
    ).toBeNull();
    expect(parseQuotaRefusal(new TypeError('fetch failed'))).toBeNull();
    expect(parseQuotaRefusal(undefined)).toBeNull();
  });

  it('counts any error with status 429 as a refusal, even without a body', () => {
    expect(parseQuotaRefusal(Object.assign(new Error('Too many'), { status: 429 }))).toEqual({
      scope: 'minute',
      retryDelayMs: null,
      quotaId: null,
    });
  });
});

describe('durationMs', () => {
  it('reads protobuf durations as strings and as objects', () => {
    expect(durationMs('37s')).toBe(37_000);
    expect(durationMs('0.5s')).toBe(500);
    expect(durationMs({ seconds: '3', nanos: 500_000_000 })).toBe(3500);
    expect(durationMs('soon')).toBeNull();
    expect(durationMs(12)).toBeNull();
  });
});

describe('nextDailyReset', () => {
  const reset = (iso: string) => nextDailyReset(new Date(iso)).toISOString();

  it('is the next midnight in Pacific time, daylight or standard', () => {
    // 19:27 PDT on Sep 27.
    expect(reset('2026-09-28T02:27:00Z')).toBe('2026-09-28T07:00:00.000Z');
    // 06:59 PDT: still the same Pacific day.
    expect(reset('2026-09-28T13:59:00Z')).toBe('2026-09-29T07:00:00.000Z');
    // 12:00 PST in January.
    expect(reset('2026-01-15T20:00:00Z')).toBe('2026-01-16T08:00:00.000Z');
  });

  it('starts the next day at midnight itself', () => {
    expect(reset('2026-09-28T07:00:00Z')).toBe('2026-09-29T07:00:00.000Z');
  });

  it('follows the clock change in either direction', () => {
    // The evening before daylight saving ends (Nov 1, 2026) and the evening after it.
    expect(reset('2026-11-01T03:00:00Z')).toBe('2026-11-01T07:00:00.000Z');
    expect(reset('2026-11-02T04:00:00Z')).toBe('2026-11-02T08:00:00.000Z');
    // The evening before daylight saving starts (Mar 8, 2026) and the evening after it.
    expect(reset('2026-03-08T04:00:00Z')).toBe('2026-03-08T08:00:00.000Z');
    expect(reset('2026-03-09T03:00:00Z')).toBe('2026-03-09T07:00:00.000Z');
  });
});

describe('the remembered daily limit', () => {
  afterEach(() => forgetDailyLimits());

  const seen = new Date('2026-09-28T02:00:00Z');
  const resetAt = new Date('2026-09-28T07:00:00Z');

  it('is in force until the reset and gone after it', () => {
    expect(activeDailyLimit(seen)).toBeNull();

    noteDailyLimit('embedding', resetAt, seen);

    expect(activeDailyLimit(new Date('2026-09-28T06:59:00Z'))).toEqual({
      kind: 'embedding',
      seenAt: seen,
      resetAt,
    });
    expect(activeDailyLimit(resetAt)).toBeNull();
  });

  it('is cleared by a call of the same kind that went through, not by another kind', () => {
    noteDailyLimit('embedding', resetAt, seen);
    clearDailyLimit('chat');
    expect(activeDailyLimit(seen)?.kind).toBe('embedding');

    clearDailyLimit('embedding');
    expect(activeDailyLimit(seen)).toBeNull();
  });

  it('reports the latest cap when both kinds ran into one', () => {
    noteDailyLimit('embedding', resetAt, seen);
    noteDailyLimit('chat', resetAt, new Date('2026-09-28T03:00:00Z'));

    expect(activeDailyLimit(seen)?.kind).toBe('chat');
  });
});
