// @vitest-environment node
import { after } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { STORAGE_BUCKET } from '@/lib/ingest';
import { getSession } from '@/lib/session';
import { storagePathFor } from '@/lib/uploads';
import {
  createServiceClient,
  createTestAccount,
  deleteTestAccount,
  hasLocalDb,
  type TestAccount,
} from '@/test/local-db';

import { DELETE } from './route';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));

const request = (id: string) =>
  new Request(`http://localhost/api/sources/${id}`, { method: 'DELETE' });
const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe('DELETE /api/sources/[id] when the database fails', () => {
  it('says so in our words and leaves the stored file alone', async () => {
    const remove = vi.fn();
    const failing = {
      from: () => ({
        delete: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({
                data: null,
                error: { code: '57014', message: 'canceling statement' },
              }),
            }),
          }),
        }),
      }),
      storage: { from: () => ({ remove }) },
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.mocked(getSession).mockResolvedValue({
      supabase: failing,
      user: { id: crypto.randomUUID() },
    } as never);

    const id = crypto.randomUUID();
    const response = await DELETE(request(id), context(id));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'The source could not be deleted. Try again in a moment.',
    });
    expect(remove).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

// Row level security decides who may delete what, so these run against the local stack.
describe.skipIf(!hasLocalDb)('DELETE /api/sources/[id]', () => {
  const service = createServiceClient();
  let owner: TestAccount | null = null;
  let stranger: TestAccount | null = null;
  const storagePaths: string[] = [];

  const signInAs = (account: TestAccount | null) =>
    vi
      .mocked(getSession)
      .mockResolvedValue(
        (account
          ? { supabase: account.client, user: { id: account.userId } }
          : { supabase: {}, user: null }) as never,
      );

  /** An uploaded Markdown file the owner indexed: its row, one page and the object in the bucket. */
  const addIndexedUpload = async () => {
    const path = storagePathFor(owner!.userId, owner!.assistantId, 'md');

    storagePaths.push(path);

    const { error: uploadError } = await service.storage
      .from(STORAGE_BUCKET)
      .upload(path, new Blob(['# Guide\n\nRead me.'], { type: 'text/markdown' }), {
        contentType: 'text/markdown',
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: source } = await service
      .from('sources')
      .insert({
        assistant_id: owner!.assistantId,
        owner_id: owner!.userId,
        kind: 'upload',
        title: 'guide.md',
        storage_path: path,
        mime_type: 'text/markdown',
        status: 'ready',
      })
      .select('id')
      .single();

    await service.from('documents').insert({
      assistant_id: owner!.assistantId,
      owner_id: owner!.userId,
      source_id: source!.id,
      title: 'Guide',
      content: '# Guide\n\nRead me.',
      checksum: crypto.randomUUID(),
    });

    return { id: source!.id, path };
  };

  const storedFile = async (path: string) => {
    const { data } = await service.storage.from(STORAGE_BUCKET).download(path);

    return data;
  };

  beforeAll(async () => {
    [owner, stranger] = await Promise.all([
      createTestAccount(service, 'delete-owner'),
      createTestAccount(service, 'delete-other'),
    ]);
  });

  afterAll(async () => {
    await service.storage.from(STORAGE_BUCKET).remove(storagePaths);
    await Promise.all([deleteTestAccount(service, owner), deleteTestAccount(service, stranger)]);
  });

  it('asks a signed-out caller to sign in', async () => {
    signInAs(null);

    const response = await DELETE(request(crypto.randomUUID()), context(crypto.randomUUID()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Sign in to remove a source.' });
  });

  it('reads a malformed id as a source that is not there', async () => {
    signInAs(owner);

    const response = await DELETE(request('not-a-uuid'), context('not-a-uuid'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'That source does not exist.' });
  });

  it("does not touch another account's source or its file", async () => {
    const { id, path } = await addIndexedUpload();

    signInAs(stranger);

    const response = await DELETE(request(id), context(id));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'That source does not exist.' });

    const { data: row } = await service
      .from('sources')
      .select('id, document_count')
      .eq('id', id)
      .maybeSingle();

    expect(row).toEqual({ id, document_count: 1 });
    expect(await storedFile(path)).not.toBeNull();
  });

  it('removes the row, its pages by cascade and then the stored file, once', async () => {
    const { id, path } = await addIndexedUpload();

    signInAs(owner);

    const response = await DELETE(request(id), context(id));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });

    const [{ data: row }, { count: pages }] = await Promise.all([
      service.from('sources').select('id').eq('id', id).maybeSingle(),
      service.from('documents').select('id', { count: 'exact', head: true }).eq('source_id', id),
    ]);

    expect(row).toBeNull();
    expect(pages).toBe(0);
    expect(await storedFile(path)).toBeNull();

    const again = await DELETE(request(id), context(id));

    expect(again.status).toBe(404);
    // Deleting schedules nothing.
    expect(after).not.toHaveBeenCalled();
  });
});
