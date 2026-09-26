// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/db';
import {
  createServiceClient,
  createTestAccount,
  deleteTestAccount,
  hasLocalDb,
  type TestAccount,
} from '@/test/local-db';

import { chargeRateLimits, rateLimit, resetRateLimits } from './rate-limit';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// The shared limiter against the local database. Each "instance" is its own client, as two
// Vercel function instances would be: nothing is shared between them but the database.
describe.skipIf(!hasLocalDb)('take_rate_limits against the local database', () => {
  const first = createServiceClient();
  const second = createServiceClient();
  const stamp = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
  const bucket = (name: string) => `test:rate-limit:${stamp}:${name}`;
  const minute = (limit: number) => ({ limit, windowMs: 60_000 });
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetRateLimits();
    logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Every call below must have reached the database, not the local fallback.
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  afterAll(async () => {
    await first.from('rate_limits').delete().like('bucket', `test:rate-limit:${stamp}:%`);
  });

  it('shares one bucket between two instances', async () => {
    const key = bucket('shared');

    for (let index = 0; index < 3; index += 1) {
      expect(await chargeRateLimits(first, [[key, minute(5)]])).toEqual({
        allowed: true,
        retryAfterMs: 0,
      });
    }

    for (let index = 0; index < 2; index += 1) {
      expect((await chargeRateLimits(second, [[key, minute(5)]])).allowed).toBe(true);
    }

    // Five hits between them fill the bucket for both.
    const refusedFirst = await chargeRateLimits(first, [[key, minute(5)]]);
    const refusedSecond = await chargeRateLimits(second, [[key, minute(5)]]);

    expect(refusedFirst.allowed).toBe(false);
    expect(refusedSecond.allowed).toBe(false);
    expect(refusedSecond.retryAfterMs).toBeGreaterThan(50_000);
    expect(refusedSecond.retryAfterMs).toBeLessThanOrEqual(60_000);

    // The count lived in the database: this process's own limiter was never charged.
    expect(rateLimit(key, minute(1)).allowed).toBe(true);
  });

  it('lets exactly the cap through when calls from two instances race', async () => {
    const key = bucket('race');
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        chargeRateLimits(index % 2 === 0 ? first : second, [[key, minute(12)]]),
      ),
    );

    expect(outcomes.filter((outcome) => outcome.allowed)).toHaveLength(12);
    expect(outcomes.filter((outcome) => !outcome.allowed)).toHaveLength(8);

    const { data } = await first.from('rate_limits').select('hits').eq('bucket', key).single();

    expect(data?.hits).toHaveLength(12);
  });

  it('charges narrowest first and stops at the first refusal', async () => {
    const narrow = bucket('narrow');
    const wide = bucket('wide');
    const pair = [
      [narrow, minute(1)],
      [wide, minute(3)],
    ] as const;

    expect((await chargeRateLimits(first, pair)).allowed).toBe(true);
    expect((await chargeRateLimits(second, pair)).allowed).toBe(false);

    // Refused by the narrow bucket, so the wide one holds a single hit and has room for two more.
    expect((await chargeRateLimits(second, [[wide, minute(3)]])).allowed).toBe(true);
    expect((await chargeRateLimits(first, [[wide, minute(3)]])).allowed).toBe(true);
    expect((await chargeRateLimits(first, [[wide, minute(3)]])).allowed).toBe(false);
  });

  it('lets a hit go once it leaves the window', async () => {
    const key = bucket('slide');
    const short = { limit: 1, windowMs: 300 };

    expect((await chargeRateLimits(first, [[key, short]])).allowed).toBe(true);

    const refused = await chargeRateLimits(second, [[key, short]]);

    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBeGreaterThan(0);
    expect(refused.retryAfterMs).toBeLessThanOrEqual(300);

    await new Promise((resolve) => setTimeout(resolve, refused.retryAfterMs + 50));

    expect((await chargeRateLimits(second, [[key, short]])).allowed).toBe(true);
  });

  it('removes buckets whose hits have all left the window', async () => {
    const key = bucket('expired');

    await first.rpc('take_rate_limit', { bucket: key, max_hits: 5, window_ms: 50 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const present = async () => {
      const { data } = await first.from('rate_limits').select('bucket').eq('bucket', key);

      return (data ?? []).length > 0;
    };

    // Every call clears up to 32 expired buckets, oldest first; a few calls reach this one even
    // with other suites' leftovers ahead of it.
    for (let attempt = 0; attempt < 20 && (await present()); attempt += 1) {
      await first.rpc('take_rate_limit', {
        bucket: bucket('sweeper'),
        max_hits: 100,
        window_ms: 60_000,
      });
    }

    expect(await present()).toBe(false);
  });

  it('is closed to the anonymous and signed-in roles', async () => {
    const anon = createClient<Database>(url, anonKey || 'not-configured', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let account: TestAccount | null = null;

    try {
      account = await createTestAccount(first, 'rate-limit');

      for (const client of [anon, account.client]) {
        const call = await client.rpc('take_rate_limit', {
          bucket: bucket('outsider'),
          max_hits: 1,
          window_ms: 60_000,
        });
        const batch = await client.rpc('take_rate_limits', {
          buckets: [bucket('outsider')],
          max_hits: [1],
          window_ms: [60_000],
        });
        const read = await client.from('rate_limits').select('bucket').limit(1);

        expect(call.error?.message).toMatch(/permission denied/);
        expect(batch.error?.message).toMatch(/permission denied/);
        expect(read.error?.message).toMatch(/permission denied/);
      }
    } finally {
      await deleteTestAccount(first, account);
    }
  });
});
