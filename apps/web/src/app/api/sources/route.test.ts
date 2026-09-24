// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAccountPlan, getAccountUsage } from '@/lib/account';
import { PLANS } from '@/lib/plans';
import { getSession } from '@/lib/session';

import { POST } from './route';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/account', () => ({ getAccountPlan: vi.fn(), getAccountUsage: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: vi.fn() }));
vi.mock('@/lib/ai', () => ({ getAiProvider: vi.fn() }));

const USER = { id: '00000000-0000-4000-8000-000000000001' };
const ASSISTANT = '11111111-1111-4111-8111-111111111111';

type FakeClient = {
  client: unknown;
  inserted: Record<string, unknown>[];
  uploads: { path: string; contentType?: string }[];
  removed: string[];
};

/** Just enough of the user client for the route: an ownership lookup, an insert and the bucket. */
const fakeClient = ({ ownsAssistant = true }: { ownsAssistant?: boolean } = {}): FakeClient => {
  const inserted: Record<string, unknown>[] = [];
  const uploads: { path: string; contentType?: string }[] = [];
  const removed: string[] = [];

  const client = {
    from: (table: string) => {
      if (table === 'assistants') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: ownsAssistant ? { id: ASSISTANT } : null, error: null }) }),
          }),
        };
      }

      if (table === 'sources') {
        return {
          insert: (row: Record<string, unknown>) => {
            inserted.push(row);

            return {
              select: () => ({
                single: async () => ({ data: { id: 'src-1', created_at: '2026-09-23T00:00:00Z', ...row }, error: null }),
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
    storage: {
      from: () => ({
        upload: async (path: string, _body: unknown, options?: { contentType?: string }) => {
          uploads.push({ path, contentType: options?.contentType });

          return { error: null };
        },
        remove: async (paths: string[]) => {
          removed.push(...paths);

          return { error: null };
        },
      }),
    },
  };

  return { client, inserted, uploads, removed };
};

const signIn = (fake: FakeClient) => {
  vi.mocked(getSession).mockResolvedValue({ supabase: fake.client, user: USER } as never);
};

const json = (body: unknown) =>
  new Request('http://localhost/api/sources', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const multipart = (fields: Record<string, string | File>) => {
  const form = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    form.set(name, value);
  }

  return new Request('http://localhost/api/sources', { method: 'POST', body: form });
};

describe('POST /api/sources', () => {
  beforeEach(() => {
    vi.mocked(getAccountPlan).mockResolvedValue({ plan: PLANS.hobby } as never);
    vi.mocked(getAccountUsage).mockResolvedValue({ assistants: 1, pages: 3, messagesThisMonth: 0 });
  });

  it('refuses anonymous callers', async () => {
    vi.mocked(getSession).mockResolvedValue({ supabase: {}, user: null } as never);

    const response = await POST(json({ kind: 'url', assistantId: ASSISTANT, url: 'https://docs.example.com' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Sign in to add a source.' });
  });

  it('rejects a body that does not validate, naming the problem', async () => {
    signIn(fakeClient());

    const missing = await POST(json({ kind: 'url', assistantId: ASSISTANT }));
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({ error: 'Enter a web address.' });

    const scheme = await POST(json({ kind: 'sitemap', assistantId: ASSISTANT, url: 'ftp://docs.example.com/sitemap.xml' }));
    expect(scheme.status).toBe(400);
    await expect(scheme.json()).resolves.toEqual({ error: 'Enter a full address that starts with http:// or https://.' });

    const kind = await POST(json({ kind: 'rss', assistantId: ASSISTANT, url: 'https://docs.example.com' }));
    expect(kind.status).toBe(400);

    const notJson = await POST(new Request('http://localhost/api/sources', { method: 'POST', body: '{' }));
    expect(notJson.status).toBe(400);

    const emptyText = await POST(json({ kind: 'text', assistantId: ASSISTANT, title: 'Notes', text: '   ' }));
    expect(emptyText.status).toBe(400);
    await expect(emptyText.json()).resolves.toEqual({ error: 'Paste some text.' });
  });

  it('refuses an assistant the caller does not own', async () => {
    const fake = fakeClient({ ownsAssistant: false });

    signIn(fake);

    const response = await POST(json({ kind: 'url', assistantId: ASSISTANT, url: 'https://docs.example.com/guide/' }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'That assistant does not exist.' });
    expect(fake.inserted).toHaveLength(0);
  });

  it('refuses when the plan has no pages left', async () => {
    const fake = fakeClient();

    signIn(fake);
    vi.mocked(getAccountUsage).mockResolvedValue({ assistants: 1, pages: PLANS.hobby.pages, messagesThisMonth: 0 });

    const response = await POST(json({ kind: 'url', assistantId: ASSISTANT, url: 'https://docs.example.com/guide/' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Your plan's page limit is reached. Upgrade on the Billing page or remove a source.",
    });
    expect(fake.inserted).toHaveLength(0);
  });

  it('creates a website source with a title taken from the address and schedules ingestion', async () => {
    const { after } = await import('next/server');
    const fake = fakeClient();

    signIn(fake);

    const response = await POST(json({ kind: 'url', assistantId: ASSISTANT, url: 'https://docs.example.com/guide/intro' }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      source: { id: 'src-1', kind: 'url', uri: 'https://docs.example.com/guide/intro', title: 'docs.example.com/guide/intro' },
    });
    expect(fake.inserted[0]).toMatchObject({ assistant_id: ASSISTANT, owner_id: USER.id, status: 'queued' });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('stores pasted text as Markdown in the bucket under the owner and assistant', async () => {
    const fake = fakeClient();

    signIn(fake);

    const response = await POST(json({ kind: 'text', assistantId: ASSISTANT, title: 'Refunds', text: '# Refunds\n\n30 days.' }));

    expect(response.status).toBe(201);
    expect(fake.uploads).toHaveLength(1);
    expect(fake.uploads[0]?.path).toMatch(new RegExp(`^${USER.id}/${ASSISTANT}/[0-9a-f-]{36}\\.md$`));
    expect(fake.uploads[0]?.contentType).toBe('text/markdown');
    expect(fake.inserted[0]).toMatchObject({ kind: 'text', title: 'Refunds', mime_type: 'text/markdown', storage_path: fake.uploads[0]?.path });
  });

  it('accepts a multipart upload of a supported file', async () => {
    const fake = fakeClient();

    signIn(fake);

    const file = new File(['# Manual\n\nRead me.'], 'manual.md', { type: 'text/markdown' });
    const response = await POST(multipart({ assistantId: ASSISTANT, file }));

    expect(response.status).toBe(201);
    expect(fake.uploads[0]?.path).toMatch(new RegExp(`^${USER.id}/${ASSISTANT}/[0-9a-f-]{36}\\.md$`));
    expect(fake.inserted[0]).toMatchObject({ kind: 'upload', title: 'manual.md', byte_size: file.size, mime_type: 'text/markdown' });
  });

  it('rejects uploads of other file types and empty files', async () => {
    signIn(fakeClient());

    const exe = await POST(multipart({ assistantId: ASSISTANT, file: new File(['x'], 'tool.exe', { type: 'application/octet-stream' }) }));
    expect(exe.status).toBe(400);
    await expect(exe.json()).resolves.toEqual({
      error: 'That file type is not supported. Upload PDF, Word, HTML, Markdown or plain text.',
    });

    const empty = await POST(multipart({ assistantId: ASSISTANT, file: new File([], 'empty.txt', { type: 'text/plain' }) }));
    expect(empty.status).toBe(400);
    await expect(empty.json()).resolves.toEqual({ error: 'Choose a file to upload.' });

    const noAssistant = await POST(multipart({ file: new File(['x'], 'a.txt', { type: 'text/plain' }) }));
    expect(noAssistant.status).toBe(400);
  });
});
