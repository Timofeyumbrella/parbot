import type { QuotaScope } from './types';

/**
 * Reading a quota refusal. Gemini answers a spent quota with 429 RESOURCE_EXHAUSTED and a Google
 * RPC error body: a QuotaFailure names the quota (its id says per minute or per day) and a
 * RetryInfo suggests when to come back. The SDK puts that body, as JSON, in the error's message.
 */

export type QuotaRefusal = {
  /** A per-minute burst, or the day's cap. A refusal that does not say counts as per minute. */
  scope: QuotaScope;
  /** RetryInfo's retryDelay, when the provider sent one. */
  retryDelayMs: number | null;
  /** The quota that ran out, e.g. EmbedContentRequestsPerDayPerProjectPerModel-FreeTier. */
  quotaId: string | null;
};

type Violation = { quotaId: string | null; quotaMetric: string | null };

const QUOTA_FAILURE = 'google.rpc.QuotaFailure';
const RETRY_INFO = 'google.rpc.RetryInfo';
/** PerDay in a quota id, per_day or daily in a metric. */
const DAILY = /per_?day|daily/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);

/** A protobuf Duration as JSON: "37s", "1.5s", or { seconds, nanos }. */
export const durationMs = (value: unknown): number | null => {
  if (typeof value === 'string') {
    const match = /^\s*(\d+(?:\.\d+)?)s\s*$/.exec(value);

    return match ? Math.round(Number(match[1]) * 1000) : null;
  }

  if (isRecord(value)) {
    const seconds = Number(value.seconds ?? 0);
    const nanos = Number(value.nanos ?? 0);

    return Number.isFinite(seconds) && Number.isFinite(nanos)
      ? Math.round(seconds * 1000 + nanos / 1e6)
      : null;
  }

  return null;
};

const statusOf = (cause: unknown) =>
  isRecord(cause) && typeof cause.status === 'number' ? cause.status : 0;

const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';

/** The `error` object of the body: from the error itself, or parsed out of its message. */
const rpcErrorOf = (cause: unknown): Record<string, unknown> | null => {
  const unwrap = (body: unknown): Record<string, unknown> | null => {
    // A streamed request may answer with an array of bodies.
    const first = Array.isArray(body) ? body[0] : body;

    if (!isRecord(first)) {
      return null;
    }

    return isRecord(first.error) ? first.error : 'details' in first ? first : null;
  };

  const direct = unwrap(cause);

  if (direct) {
    return direct;
  }

  // "{"error":{...}}" from a request, "got status: RESOURCE_EXHAUSTED. {"error":{...}}" from a stream.
  const message = messageOf(cause);
  const start = message.search(/[[{]/);

  if (start === -1) {
    return null;
  }

  try {
    return unwrap(JSON.parse(message.slice(start)));
  } catch {
    return null;
  }
};

const fromDetails = (details: unknown[]) => {
  const violations: Violation[] = [];
  let retryDelayMs: number | null = null;

  for (const detail of details) {
    if (!isRecord(detail)) {
      continue;
    }

    const type = String(detail['@type'] ?? '');

    if (type.endsWith(QUOTA_FAILURE) && Array.isArray(detail.violations)) {
      for (const violation of detail.violations) {
        if (isRecord(violation)) {
          violations.push({
            quotaId: text(violation.quotaId),
            quotaMetric: text(violation.quotaMetric),
          });
        }
      }
    } else if (type.endsWith(RETRY_INFO)) {
      retryDelayMs = durationMs(detail.retryDelay);
    }
  }

  return { violations, retryDelayMs };
};

/** For a message whose JSON did not survive (cut short, wrapped): the same fields, by pattern. */
const fromText = (message: string) => {
  const violations: Violation[] = [...message.matchAll(/"quotaId"\s*:\s*"([^"]+)"/g)].map(
    (match) => ({ quotaId: match[1] ?? null, quotaMetric: null }),
  );
  const metrics = [...message.matchAll(/"quotaMetric"\s*:\s*"([^"]+)"/g)].map((match) => ({
    quotaId: null,
    quotaMetric: match[1] ?? null,
  }));
  const delay =
    /"retryDelay"\s*:\s*"([^"]+)"/.exec(message)?.[1] ??
    /retry in (\d+(?:\.\d+)?s)\b/i.exec(message)?.[1];

  return {
    violations: [...violations, ...metrics],
    retryDelayMs: delay ? durationMs(delay) : null,
  };
};

/**
 * What a 429 says about the quota it ran into, or null for any other error. The day's cap wins
 * when a refusal names several quotas: waiting out a minute does not bring that one back.
 */
export const parseQuotaRefusal = (cause: unknown): QuotaRefusal | null => {
  const error = rpcErrorOf(cause);
  const refused =
    statusOf(cause) === 429 ||
    (error !== null && (error.code === 429 || error.status === 'RESOURCE_EXHAUSTED'));

  if (!refused) {
    return null;
  }

  const found =
    error && Array.isArray(error.details) ? fromDetails(error.details) : fromText(messageOf(cause));
  const humanDelay = /retry in (\d+(?:\.\d+)?s)\b/i.exec(text(error?.message) ?? '')?.[1];
  const retryDelayMs = found.retryDelayMs ?? (humanDelay ? durationMs(humanDelay) : null);
  const daily = found.violations.find((violation) =>
    DAILY.test(`${violation.quotaId ?? ''} ${violation.quotaMetric ?? ''}`),
  );
  const named = daily ?? found.violations.find((violation) => violation.quotaId);

  return {
    scope: daily ? 'day' : 'minute',
    retryDelayMs,
    quotaId: named?.quotaId ?? named?.quotaMetric ?? null,
  };
};

const PACIFIC = 'America/Los_Angeles';
const pacificClock = new Intl.DateTimeFormat('en-US', {
  timeZone: PACIFIC,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
});

/** How far the Pacific wall clock is from UTC at a moment: minus seven or eight hours. */
const pacificOffsetMs = (at: number) => {
  const parts = Object.fromEntries(
    pacificClock.formatToParts(new Date(at)).map((part) => [part.type, Number(part.value)]),
  );
  const wall = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!,
  );

  return wall - Math.floor(at / 1000) * 1000;
};

/**
 * When a daily quota comes back: Gemini resets requests per day at midnight Pacific time. The
 * clocks change at 2:00, never at midnight, so one correction for the offset settles it.
 */
export const nextDailyReset = (now: Date = new Date()) => {
  const at = now.getTime();
  const wall = new Date(at + pacificOffsetMs(at));
  const midnight = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1);
  const guess = midnight - pacificOffsetMs(midnight);

  return new Date(midnight - pacificOffsetMs(guess));
};

export type DailyLimitKind = 'embedding' | 'chat';

export type DailyLimitNotice = { kind: DailyLimitKind; seenAt: Date; resetAt: Date };

/**
 * The last daily cap each kind of call ran into, on this server instance. /api/health reads it,
 * so it can say answers are paused without spending a request of its own to find out.
 */
const dailyLimits = new Map<DailyLimitKind, DailyLimitNotice>();

export const noteDailyLimit = (kind: DailyLimitKind, resetAt: Date, now: Date = new Date()) => {
  dailyLimits.set(kind, { kind, seenAt: now, resetAt });
};

/** A call of this kind went through, so its cap is behind us whatever the clock says. */
export const clearDailyLimit = (kind: DailyLimitKind) => {
  dailyLimits.delete(kind);
};

/** The daily cap in force now, the most recently seen when both kinds are capped; null for none. */
export const activeDailyLimit = (now: Date = new Date()): DailyLimitNotice | null => {
  let latest: DailyLimitNotice | null = null;

  for (const notice of dailyLimits.values()) {
    if (notice.resetAt > now && (!latest || notice.seenAt > latest.seenAt)) {
      latest = notice;
    }
  }

  return latest;
};

/** Test hook. */
export const forgetDailyLimits = () => {
  dailyLimits.clear();
};
