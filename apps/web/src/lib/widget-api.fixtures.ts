import type { ServiceClient } from '@/lib/engine';
import { createLocalRateLimiter, type RateLimitBucket, takeInOrder } from '@/lib/engine/rate-limit';

/**
 * A stand-in for the service client that the widget route tests run against: tables are plain
 * arrays, filters are equality only, and inserts are recorded so a test can inspect them. The
 * `take_rate_limits` function keeps its buckets in memory, one set per fake, with the database
 * function's semantics: narrowest first, stop at the first refusal.
 */

export type FakeRow = Record<string, unknown>;
export type FakeTables = Record<string, FakeRow[]>;

export type FakeService = {
  client: ServiceClient;
  inserted: Record<string, FakeRow[]>;
  failInsert: (table: string, message: string) => void;
  /** Makes every later call of a database function answer with this error. */
  failRpc: (fn: string, message: string) => void;
  /** Every database function call, in order. */
  calls: { fn: string; args: Record<string, unknown> }[];
};

export const PUBLIC_KEY = 'pb_0123456789abcdef0123456789abcdef';

export const assistantRow = (overrides: FakeRow = {}): FakeRow => ({
  id: '11111111-1111-4111-8111-111111111111',
  owner_id: '00000000-0000-4000-8000-000000000001',
  name: 'Docs bot',
  instructions: null,
  welcome_message: 'Ask me about the docs.',
  suggested_questions: ['One', 'Two', 'Three', 'Four', 'Five'],
  mode: 'palette',
  theme: { scheme: 'dark', accent: '#2563eb', position: 'left', radius: 'lg' },
  allowed_origins: [],
  hide_branding: true,
  lead_capture: true,
  public_key: PUBLIC_KEY,
  ...overrides,
});

export const createFakeService = (tables: FakeTables = {}): FakeService => {
  const inserted: Record<string, FakeRow[]> = {};
  const failures: Record<string, string> = {};

  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    const matches = () =>
      (tables[table] ?? []).filter((row) =>
        filters.every(([column, value]) => row[column] === value),
      );

    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);

        return query;
      },
      maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
      single: async () => {
        const row = matches()[0];

        return row ? { data: row, error: null } : { data: null, error: { message: 'No rows.' } };
      },
      insert: (payload: FakeRow | FakeRow[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        (inserted[table] ??= []).push(...rows);
        const failure = failures[table];
        const result = failure
          ? { data: null, error: { message: failure } }
          : { data: null, error: null };

        return {
          ...query,
          then: (resolve: (value: typeof result) => void) => resolve(result),
        };
      },
      update: () => query,
      delete: () => query,
    };

    return query;
  };

  const limiter = createLocalRateLimiter();
  const rpcFailures: Record<string, string> = {};
  const calls: FakeService['calls'] = [];

  const run = (fn: string, args: Record<string, unknown>) => {
    const failure = rpcFailures[fn];

    if (failure) {
      return { data: null, error: { message: failure } };
    }

    if (fn !== 'take_rate_limits') {
      return { data: null, error: null };
    }

    const keys = args.buckets as string[];
    const maxHits = args.max_hits as number[];
    const windows = args.window_ms as number[];
    const buckets = keys.map((key, index): RateLimitBucket => [
      key,
      { limit: maxHits[index]!, windowMs: windows[index]! },
    ]);
    const outcome = takeInOrder(limiter.take, buckets);

    return {
      data: [{ allowed: outcome.allowed, retry_after_ms: Math.ceil(outcome.retryAfterMs) }],
      error: null,
    };
  };

  /** Enough of PostgREST's builder for the callers: awaitable, with `.single()` and `.abortSignal()`. */
  const rpc = (fn: string, args: Record<string, unknown> = {}) => {
    calls.push({ fn, args });
    let single = false;

    const builder = {
      abortSignal: () => builder,
      single: () => {
        single = true;

        return builder;
      },
      then: <T>(resolve: (value: { data: unknown; error: unknown }) => T) => {
        const result = run(fn, args);
        const data = single && Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;

        return Promise.resolve(resolve({ data, error: result.error }));
      },
    };

    return builder;
  };

  const client = { from, rpc } as unknown as ServiceClient;

  return {
    client,
    inserted,
    calls,
    failInsert: (table, message) => {
      failures[table] = message;
    },
    failRpc: (fn, message) => {
      rpcFailures[fn] = message;
    },
  };
};
