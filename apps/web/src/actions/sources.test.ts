// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Source } from '@/lib/db';
import { SourceError } from '@/lib/ingest/sources';
import { getSession } from '@/lib/session';

import { addSource, deleteSource, reindexSource } from './sources';

const { createSource, removeSource, requestReindex, scheduleIngestion } = vi.hoisted(() => ({
  createSource: vi.fn(),
  removeSource: vi.fn(),
  requestReindex: vi.fn(),
  scheduleIngestion: vi.fn(),
}));

// The source rules themselves are tested with the routes; here the actions' own job is checked.
vi.mock('@/lib/ingest/sources', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ingest/sources')>()),
  createSource,
  deleteSource: removeSource,
  requestReindex,
  scheduleIngestion,
}));
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));

const USER = { id: '00000000-0000-4000-8000-000000000001' };
const ASSISTANT = '11111111-1111-4111-8111-111111111111';
const SOURCE_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE = { id: SOURCE_ID, title: 'docs.example.com', status: 'queued' } as Source;

const form = (fields: Record<string, string>) => {
  const data = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }

  return data;
};

describe('source actions', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({ supabase: {}, user: USER } as never);
  });

  it('ask a signed-out visitor to sign in and touch nothing', async () => {
    vi.mocked(getSession).mockResolvedValue({ supabase: {}, user: null } as never);

    await expect(
      addSource({}, form({ kind: 'url', assistantId: ASSISTANT, url: 'https://docs.example.com' })),
    ).resolves.toEqual({
      error: 'Sign in to add a source.',
    });
    await expect(reindexSource(SOURCE_ID)).resolves.toEqual({
      error: 'Sign in to re-index a source.',
    });
    await expect(deleteSource(SOURCE_ID)).resolves.toEqual({
      error: 'Sign in to remove a source.',
    });
    expect(createSource).not.toHaveBeenCalled();
    expect(requestReindex).not.toHaveBeenCalled();
    expect(removeSource).not.toHaveBeenCalled();
  });

  it('adds a website and starts indexing it', async () => {
    createSource.mockResolvedValue(SOURCE);

    const result = await addSource(
      {},
      form({ kind: 'url', assistantId: ASSISTANT, url: ' https://docs.example.com ' }),
    );

    expect(result).toEqual({ source: SOURCE });
    expect(createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        user: USER,
        input: expect.objectContaining({ kind: 'url', url: 'https://docs.example.com' }),
      }),
    );
    expect(scheduleIngestion).toHaveBeenCalledExactlyOnceWith(SOURCE_ID);
  });

  it('names the first problem with the form and schedules nothing', async () => {
    await expect(
      addSource({}, form({ kind: 'text', assistantId: ASSISTANT, title: 'Notes', text: ' ' })),
    ).resolves.toEqual({
      error: 'Paste some text.',
    });
    expect(createSource).not.toHaveBeenCalled();
    expect(scheduleIngestion).not.toHaveBeenCalled();
  });

  it("passes a refusal through in the source rules' words", async () => {
    createSource.mockRejectedValue(
      new SourceError(
        403,
        "Your plan's page limit is reached. Upgrade on the Billing page or remove a source.",
      ),
    );
    requestReindex.mockRejectedValue(
      new SourceError(409, 'This source is being indexed right now. Wait for it to finish.'),
    );
    removeSource.mockRejectedValue(new SourceError(404, 'That source does not exist.'));

    await expect(
      addSource({}, form({ kind: 'url', assistantId: ASSISTANT, url: 'https://docs.example.com' })),
    ).resolves.toEqual({
      error: "Your plan's page limit is reached. Upgrade on the Billing page or remove a source.",
    });
    await expect(reindexSource(SOURCE_ID)).resolves.toEqual({
      error: 'This source is being indexed right now. Wait for it to finish.',
    });
    await expect(deleteSource(SOURCE_ID)).resolves.toEqual({
      error: 'That source does not exist.',
    });
    expect(scheduleIngestion).not.toHaveBeenCalled();
  });

  it('never shows an unexpected error as it is, and logs it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    requestReindex.mockRejectedValue(new Error('fetch failed: ECONNREFUSED 127.0.0.1:54321'));

    await expect(reindexSource(SOURCE_ID)).resolves.toEqual({
      error: 'Something went wrong on our side. Try again in a moment.',
    });
    expect(error).toHaveBeenCalledWith('[sources] unexpected failure', expect.any(Error));
    error.mockRestore();
  });

  it('reads a malformed id as a source that is not there, without asking the database', async () => {
    await expect(reindexSource('not-a-uuid')).resolves.toEqual({
      error: 'That source does not exist.',
    });
    await expect(deleteSource('not-a-uuid')).resolves.toEqual({
      error: 'That source does not exist.',
    });
    expect(requestReindex).not.toHaveBeenCalled();
    expect(removeSource).not.toHaveBeenCalled();
  });

  it('re-indexes once and deletes by id', async () => {
    requestReindex.mockResolvedValue(SOURCE);
    removeSource.mockResolvedValue(undefined);

    await expect(reindexSource(SOURCE_ID)).resolves.toEqual({ source: SOURCE });
    expect(requestReindex).toHaveBeenCalledWith(expect.objectContaining({ sourceId: SOURCE_ID }));
    expect(scheduleIngestion).toHaveBeenCalledExactlyOnceWith(SOURCE_ID);

    await expect(deleteSource(SOURCE_ID)).resolves.toEqual({});
    expect(removeSource).toHaveBeenCalledWith(expect.objectContaining({ sourceId: SOURCE_ID }));
  });
});
