import type { ServiceClient } from './retrieval';

/**
 * Rate limits shared by every function instance. On Vercel each instance has its own memory, so a
 * limiter held there lets through the cap times the number of warm instances. The buckets live in
 * the database instead (`take_rate_limits`, one round trip per request, atomic under a row lock).
 * An in-memory sliding window stays as the fallback for when that call fails: the request goes
 * through on this instance's own count rather than being refused for our fault.
 */

export type RateLimit = { limit: number; windowMs: number };
/** A bucket's key and its allowance. Lists of them go narrowest first. */
export type RateLimitBucket = readonly [key: string, limit: RateLimit];
export type RateLimitVerdict = { allowed: boolean; remaining: number; retryAfterMs: number };
/** The outcome of charging a list of buckets: whether all let the request through, and the wait if not. */
export type RateLimitOutcome = { allowed: boolean; retryAfterMs: number };

type Take = (key: string, limit: RateLimit & { now?: number }) => RateLimitVerdict;

const SWEEP_EVERY = 500;

/** A sliding window limiter held in process memory. */
export const createLocalRateLimiter = () => {
  const buckets = new Map<string, number[]>();
  let calls = 0;

  const take: Take = (key, { limit, windowMs, now = Date.now() }) => {
    calls += 1;

    if (calls % SWEEP_EVERY === 0) {
      for (const [bucketKey, stamps] of buckets) {
        if (stamps.every((stamp) => now - stamp >= windowMs)) {
          buckets.delete(bucketKey);
        }
      }
    }

    const recent = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);

    if (recent.length >= limit) {
      buckets.set(key, recent);

      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: recent[0] === undefined ? windowMs : windowMs - (now - recent[0]),
      };
    }

    recent.push(now);
    buckets.set(key, recent);

    return { allowed: true, remaining: limit - recent.length, retryAfterMs: 0 };
  };

  const reset = () => {
    buckets.clear();
    calls = 0;
  };

  return { take, reset };
};

/**
 * Charges one hit to each bucket in turn and stops at the first that is full, so a request one
 * bucket refuses is not charged to the wider ones behind it. The database function does the same.
 */
export const takeInOrder = (take: Take, buckets: readonly RateLimitBucket[]): RateLimitOutcome => {
  for (const [key, limit] of buckets) {
    const verdict = take(key, limit);

    if (!verdict.allowed) {
      return { allowed: false, retryAfterMs: verdict.retryAfterMs };
    }
  }

  return { allowed: true, retryAfterMs: 0 };
};

const local = createLocalRateLimiter();

/** This instance's own limiter, used when the shared one cannot be reached. */
export const rateLimit = local.take;

/** Test hook: empties this instance's fallback buckets. */
export const resetRateLimits = local.reset;

/**
 * How long the shared limiter may take before the request goes ahead on the local count. It
 * answers in a few milliseconds from the same region; a stuck call must not hold up the answer.
 */
export const SHARED_RATE_LIMIT_TIMEOUT_MS = 2_000;

/**
 * Charges a request to its buckets, narrowest first, in the database every instance shares. When
 * the database call fails or times out, the request is charged to this instance's buckets
 * instead and the failure is logged: a broken limiter should not take the product down with it.
 */
export const chargeRateLimits = async (
  service: ServiceClient,
  buckets: readonly RateLimitBucket[],
  { timeoutMs = SHARED_RATE_LIMIT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<RateLimitOutcome> => {
  if (buckets.length === 0) {
    return { allowed: true, retryAfterMs: 0 };
  }

  try {
    const { data, error } = await service
      .rpc('take_rate_limits', {
        buckets: buckets.map(([key]) => key),
        max_hits: buckets.map(([, limit]) => limit.limit),
        window_ms: buckets.map(([, limit]) => limit.windowMs),
      })
      .abortSignal(AbortSignal.timeout(timeoutMs))
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (typeof data?.allowed !== 'boolean') {
      throw new Error('take_rate_limits returned no verdict.');
    }

    return { allowed: data.allowed, retryAfterMs: data.allowed ? 0 : data.retry_after_ms };
  } catch (cause) {
    console.error(
      '[rate-limit] the shared limiter failed; charging this instance only',
      cause instanceof Error ? cause.message : cause,
    );

    return takeInOrder(rateLimit, buckets);
  }
};
