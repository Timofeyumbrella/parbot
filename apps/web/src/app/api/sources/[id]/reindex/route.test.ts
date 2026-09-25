// @vitest-environment node
import { after } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/db';
import { STALE_RUN_MS } from '@/lib/ingest';
import { getSession } from '@/lib/session';
import {
  createServiceClient,
  createTestAccount,
  deleteTestAccount,
  hasLocalDb,
  type TestAccount,
} from '@/test/local-db';

import { POST } from './route';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));

type SourceRow = Database['public']['Tables']['sources']['Insert'];

const request = (id: string) =>
  new Request(`http://localhost/api/sources/${id}/reindex`, { method: 'POST' });
const context = (id: string) => ({ params: Promise.resolve({ id }) });

// The conditional update and row level security are the behaviour here, so these run against the local stack.
describe.skipIf(!hasLocalDb)('POST /api/sources/[id]/reindex', () => {
  const service = createServiceClient();
  let owner: TestAccount | null = null;
  let stranger: TestAccount | null = null;

  const signInAs = (account: TestAccount | null) =>
    vi
      .mocked(getSession)
      .mockResolvedValue(
        (account
          ? { supabase: account.client, user: { id: account.userId } }
          : { supabase: {}, user: null }) as never,
      );

  const addSource = async (row: Partial<SourceRow> = {}) => {
    const { data, error } = await service
      .from('sources')
      .insert({
        assistant_id: owner!.assistantId,
        owner_id: owner!.userId,
        kind: 'url',
        title: 'Docs',
        uri: 'https://docs.example.com/',
        status: 'ready',
        error:
          'Stopped after 300 pages, the most one run indexes. Re-index to continue with the rest.',
        pages_found: 300,
        pages_done: 300,
        ...row,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'no source');
    }

    return data.id;
  };

  const loadSource = async (id: string) => {
    const { data } = await service
      .from('sources')
      .select('status, error, pages_found, pages_done')
      .eq('id', id)
      .single();

    return data;
  };

  beforeAll(async () => {
    [owner, stranger] = await Promise.all([
      createTestAccount(service, 'reindex-owner'),
      createTestAccount(service, 'reindex-other'),
    ]);
  });

  afterAll(async () => {
    await Promise.all([deleteTestAccount(service, owner), deleteTestAccount(service, stranger)]);
  });

  beforeEach(() => {
    vi.mocked(after).mockClear();
  });

  it('asks a signed-out caller to sign in', async () => {
    signInAs(null);

    const response = await POST(request(crypto.randomUUID()), context(crypto.randomUUID()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Sign in to re-index a source.' });
    expect(after).not.toHaveBeenCalled();
  });

  it('reads a malformed or unknown id as a source that is not there', async () => {
    signInAs(owner);

    for (const id of ['not-a-uuid', crypto.randomUUID()]) {
      const response = await POST(request(id), context(id));

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'That source does not exist.' });
    }

    expect(after).not.toHaveBeenCalled();
  });

  it("leaves another account's source as it is", async () => {
    const id = await addSource();

    signInAs(stranger);

    const response = await POST(request(id), context(id));

    expect(response.status).toBe(404);
    expect(await loadSource(id)).toMatchObject({ status: 'ready', pages_done: 300 });
    expect(after).not.toHaveBeenCalled();
  });

  it('queues a finished source, clears its last note and schedules one run', async () => {
    const id = await addSource();

    signInAs(owner);

    const response = await POST(request(id), context(id));
    const body = (await response.json()) as {
      source: { id: string; status: string; error: string | null };
    };

    expect(response.status).toBe(202);
    expect(body.source).toMatchObject({ id, status: 'queued', error: null });
    expect(await loadSource(id)).toEqual({
      status: 'queued',
      error: null,
      pages_found: 0,
      pages_done: 0,
    });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('refuses a second run while one is under way', async () => {
    const id = await addSource({
      status: 'indexing',
      error: null,
      pages_found: 40,
      pages_done: 12,
    });

    signInAs(owner);

    const response = await POST(request(id), context(id));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'This source is being indexed right now. Wait for it to finish.',
    });
    expect(await loadSource(id)).toMatchObject({ status: 'indexing', pages_done: 12 });
    expect(after).not.toHaveBeenCalled();
  });

  it('starts over a run that stopped moving', async () => {
    const stale = new Date(Date.now() - STALE_RUN_MS - 60_000).toISOString();
    const id = await addSource({
      status: 'crawling',
      error: null,
      pages_found: 5,
      pages_done: 0,
      updated_at: stale,
    });

    signInAs(owner);

    const response = await POST(request(id), context(id));

    expect(response.status).toBe(202);
    expect(await loadSource(id)).toMatchObject({ status: 'queued', pages_found: 0 });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('queues a double click once', async () => {
    const id = await addSource();

    signInAs(owner);

    const responses = await Promise.all([
      POST(request(id), context(id)),
      POST(request(id), context(id)),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([202, 409]);
    expect(after).toHaveBeenCalledTimes(1);
  });
});
