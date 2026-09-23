/**
 * Sliding window rate limiter held in process memory. Good enough for a single deployment; swap
 * for a shared store if the app ever runs on more than one instance.
 */

type Bucket = number[];

const buckets = new Map<string, Bucket>();
const SWEEP_EVERY = 500;
let calls = 0;

export type RateLimitVerdict = { allowed: boolean; remaining: number; retryAfterMs: number };

export const rateLimit = (
  key: string,
  { limit, windowMs, now = Date.now() }: { limit: number; windowMs: number; now?: number },
): RateLimitVerdict => {
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

    return { allowed: false, remaining: 0, retryAfterMs: windowMs - (now - recent[0]!) };
  }

  recent.push(now);
  buckets.set(key, recent);

  return { allowed: true, remaining: limit - recent.length, retryAfterMs: 0 };
};

/** Test hook. */
export const resetRateLimits = () => {
  buckets.clear();
  calls = 0;
};
