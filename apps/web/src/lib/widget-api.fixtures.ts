import type { ServiceClient } from '@/lib/engine';

/**
 * A stand-in for the service client that the widget route tests run against: tables are plain
 * arrays, filters are equality only, and inserts are recorded so a test can inspect them.
 */

export type FakeRow = Record<string, unknown>;
export type FakeTables = Record<string, FakeRow[]>;

export type FakeService = {
  client: ServiceClient;
  inserted: Record<string, FakeRow[]>;
  failInsert: (table: string, message: string) => void;
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

  const client = {
    from,
    rpc: async () => ({ data: null, error: null }),
  } as unknown as ServiceClient;

  return {
    client,
    inserted,
    failInsert: (table, message) => {
      failures[table] = message;
    },
  };
};
