import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeService } from '@/lib/widget-api.fixtures';

import {
  chargeRateLimits,
  createLocalRateLimiter,
  rateLimit,
  resetRateLimits,
  takeInOrder,
} from './rate-limit';
import type { ServiceClient } from './retrieval';

const minute = (limit: number) => ({ limit, windowMs: 60_000 });

describe('createLocalRateLimiter', () => {
  it('allows the cap within a sliding window, then says how long until the oldest hit leaves it', () => {
    const { take } = createLocalRateLimiter();

    expect(take('k', { limit: 2, windowMs: 1_000, now: 0 })).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterMs: 0,
    });
    expect(take('k', { limit: 2, windowMs: 1_000, now: 400 }).allowed).toBe(true);
    expect(take('k', { limit: 2, windowMs: 1_000, now: 700 })).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterMs: 300,
    });
    // The first hit has left the window; the second is still in it.
    expect(take('k', { limit: 2, windowMs: 1_000, now: 1_000 }).allowed).toBe(true);
    expect(take('k', { limit: 2, windowMs: 1_000, now: 1_100 }).allowed).toBe(false);
  });

  it('keeps buckets apart and forgets them on reset', () => {
    const limiter = createLocalRateLimiter();

    expect(limiter.take('a', { limit: 1, windowMs: 1_000, now: 0 }).allowed).toBe(true);
    expect(limiter.take('b', { limit: 1, windowMs: 1_000, now: 0 }).allowed).toBe(true);
    expect(limiter.take('a', { limit: 1, windowMs: 1_000, now: 1 }).allowed).toBe(false);

    limiter.reset();

    expect(limiter.take('a', { limit: 1, windowMs: 1_000, now: 2 }).allowed).toBe(true);
  });
});

describe('takeInOrder', () => {
  it('stops at the first full bucket and does not charge the wider ones behind it', () => {
    const { take } = createLocalRateLimiter();

    expect(
      takeInOrder(take, [
        ['narrow', minute(1)],
        ['wide', minute(2)],
      ]),
    ).toEqual({ allowed: true, retryAfterMs: 0 });

    const refused = takeInOrder(take, [
      ['narrow', minute(1)],
      ['wide', minute(2)],
    ]);

    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBeGreaterThan(59_000);

    // The wide bucket was charged once, so it still has room for one more.
    expect(takeInOrder(take, [['wide', minute(2)]]).allowed).toBe(true);
    expect(takeInOrder(take, [['wide', minute(2)]]).allowed).toBe(false);
  });
});

describe('chargeRateLimits', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetRateLimits();
    logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('charges every bucket in one database call, narrowest first, and leaves the local limiter alone', async () => {
    const fake = createFakeService();

    await expect(
      chargeRateLimits(fake.client, [
        ['visitor', minute(12)],
        ['ip', minute(30)],
      ]),
    ).resolves.toEqual({ allowed: true, retryAfterMs: 0 });

    expect(fake.calls).toEqual([
      {
        fn: 'take_rate_limits',
        args: { buckets: ['visitor', 'ip'], max_hits: [12, 30], window_ms: [60_000, 60_000] },
      },
    ]);
    // Nothing was counted in this instance's memory: a cap of one still has its one.
    expect(rateLimit('visitor', minute(1)).allowed).toBe(true);
    expect(logged).not.toHaveBeenCalled();
  });

  it("passes the database's refusal and wait through", async () => {
    const fake = createFakeService();

    await chargeRateLimits(fake.client, [['visitor', minute(1)]]);
    const refused = await chargeRateLimits(fake.client, [['visitor', minute(1)]]);

    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBeGreaterThan(59_000);
    expect(refused.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('asks nothing of the database when there is nothing to charge', async () => {
    const fake = createFakeService();

    await expect(chargeRateLimits(fake.client, [])).resolves.toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    expect(fake.calls).toEqual([]);
  });

  it('falls back to this instance, narrowest first, and logs when the database call fails', async () => {
    const fake = createFakeService();
    fake.failRpc('take_rate_limits', 'function public.take_rate_limits does not exist');
    const buckets = [
      ['narrow', minute(1)],
      ['wide', minute(2)],
    ] as const;

    await expect(chargeRateLimits(fake.client, buckets)).resolves.toEqual({
      allowed: true,
      retryAfterMs: 0,
    });

    const refused = await chargeRateLimits(fake.client, buckets);

    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBeGreaterThan(59_000);
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('[rate-limit]'),
      'function public.take_rate_limits does not exist',
    );
    // The refusal was not charged to the wide bucket.
    expect(rateLimit('wide', minute(2)).allowed).toBe(true);
    expect(rateLimit('wide', minute(2)).allowed).toBe(false);
  });

  it('falls back when the database answers without a verdict or throws', async () => {
    const empty = {
      rpc: () => {
        const builder = {
          abortSignal: () => builder,
          single: () => builder,
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve(resolve({ data: null, error: null })),
        };

        return builder;
      },
    } as unknown as ServiceClient;
    const throwing = {
      rpc: () => {
        throw new TypeError('fetch failed');
      },
    } as unknown as ServiceClient;

    await expect(chargeRateLimits(empty, [['k', minute(1)]])).resolves.toMatchObject({
      allowed: true,
    });
    await expect(chargeRateLimits(throwing, [['k', minute(1)]])).resolves.toMatchObject({
      allowed: false,
    });
    expect(logged).toHaveBeenCalledTimes(2);
  });

  it('gives up on a database call that hangs and lets the local count decide', async () => {
    let signal: AbortSignal | undefined;
    // PostgREST resolves an aborted request with an error rather than rejecting.
    const hanging = {
      rpc: () => {
        const builder = {
          abortSignal: (value: AbortSignal) => {
            signal = value;

            return builder;
          },
          single: () => builder,
          then: (resolve: (value: unknown) => unknown) =>
            new Promise((done) => {
              signal!.addEventListener('abort', () =>
                done(resolve({ data: null, error: { message: 'AbortError: timed out' } })),
              );
            }),
        };

        return builder;
      },
    } as unknown as ServiceClient;

    const started = Date.now();
    const outcome = await chargeRateLimits(hanging, [['k', minute(1)]], { timeoutMs: 20 });

    expect(outcome.allowed).toBe(true);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(logged).toHaveBeenCalledWith(expect.any(String), 'AbortError: timed out');
  });
});
