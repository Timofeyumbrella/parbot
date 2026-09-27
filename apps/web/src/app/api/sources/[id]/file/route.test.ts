// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/db';
import { getSession } from '@/lib/session';
import { STORAGE_BUCKET, storagePathFor } from '@/lib/uploads';

import { GET } from './route';

vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };

type Account = { userId: string; assistantId: string; client: SupabaseClient<Database> };

const request = (id: string) => new Request(`http://localhost/api/sources/${id}/file`);
const context = (id: string) => ({ params: Promise.resolve({ id }) });

// Row level security and the storage policies decide who may open what, so this runs against the
// local stack as throwaway accounts.
describe.skipIf(!serviceKey || !anonKey)('GET /api/sources/[id]/file', () => {
  const service = createClient<Database>(url, serviceKey || 'not-configured', options);
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const paths: string[] = [];
  let owner: Account;
  let stranger: Account;

  const account = async (label: string): Promise<Account> => {
    const email = `file-route-${label}-${stamp}@parbot.test`;
    const password = `pw-${crypto.randomUUID()}`;
    const { data } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    const userId = data.user!.id;
    const { data: assistant } = await service
      .from('assistants')
      .insert({ owner_id: userId, name: 'Files', slug: `file-route-${label}-${stamp}` })
      .select('id')
      .single();
    const client = createClient<Database>(url, anonKey || 'not-configured', options);

    await client.auth.signInWithPassword({ email, password });

    return { userId, assistantId: assistant!.id, client };
  };

  const signInAs = (who: Account | null) =>
    vi
      .mocked(getSession)
      .mockResolvedValue(
        (who
          ? { supabase: who.client, user: { id: who.userId } }
          : { supabase: {}, user: null }) as never,
      );

  /** A stored file and its source row, as the sources route leaves them. */
  const addFile = async (input: {
    kind: 'upload' | 'text';
    title: string;
    extension: string;
    mime: string;
    body: BlobPart;
  }) => {
    const path = storagePathFor(owner.userId, owner.assistantId, input.extension);

    paths.push(path);

    const blob = new Blob([input.body], { type: input.mime });
    const { error } = await service.storage
      .from(STORAGE_BUCKET)
      .upload(path, blob, { contentType: input.mime });

    if (error) {
      throw new Error(error.message);
    }

    const { data: source } = await service
      .from('sources')
      .insert({
        assistant_id: owner.assistantId,
        owner_id: owner.userId,
        kind: input.kind,
        title: input.title,
        storage_path: path,
        mime_type: input.mime,
        byte_size: blob.size,
        status: 'ready',
      })
      .select('id')
      .single();

    return source!.id;
  };

  let pdfId = '';
  let markdownId = '';
  let docxId = '';
  let pastedId = '';
  let websiteId = '';

  beforeAll(async () => {
    [owner, stranger] = await Promise.all([account('owner'), account('stranger')]);

    pdfId = await addFile({
      kind: 'upload',
      title: 'Pricing sheet',
      extension: 'pdf',
      mime: 'application/pdf',
      body: '%PDF-1.4\n% a tiny stand-in\n',
    });
    markdownId = await addFile({
      kind: 'upload',
      title: 'limits.md',
      extension: 'md',
      mime: 'text/markdown',
      body: '# Limits\n\nFive projects per workspace.',
    });
    docxId = await addFile({
      kind: 'upload',
      title: 'Handbook',
      extension: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: 'PK not really a zip',
    });
    pastedId = await addFile({
      kind: 'text',
      title: 'Refund policy',
      extension: 'md',
      mime: 'text/markdown',
      body: '# Refunds\n\nWithin 30 days.',
    });

    const { data: website } = await service
      .from('sources')
      .insert({
        assistant_id: owner.assistantId,
        owner_id: owner.userId,
        kind: 'url',
        title: 'Docs site',
        uri: 'https://docs.example.com/',
        status: 'ready',
      })
      .select('id')
      .single();

    websiteId = website!.id;
  });

  afterAll(async () => {
    await service.storage.from(STORAGE_BUCKET).remove(paths);

    for (const who of [owner, stranger]) {
      if (who) {
        await service.auth.admin.deleteUser(who.userId);
      }
    }
  });

  it('asks a signed-out caller to sign in', async () => {
    signInAs(null);

    const response = await GET(request(pdfId), context(pdfId));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Sign in to open this file.' });
  });

  it("does not open another account's file, or say that it exists", async () => {
    signInAs(stranger);

    for (const id of [pdfId, markdownId, crypto.randomUUID()]) {
      const response = await GET(request(id), context(id));

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'That file does not exist.' });
    }
  });

  it('reads a malformed id as a file that is not there', async () => {
    signInAs(owner);

    const response = await GET(request('../etc'), context('../etc'));

    expect(response.status).toBe(404);
  });

  it('redirects the owner to a short-lived signed address that opens a PDF in the browser', async () => {
    signInAs(owner);

    const response = await GET(request(pdfId), context(pdfId));

    expect(response.status).toBe(302);
    expect(response.headers.get('cache-control')).toBe('private, no-store');

    const location = response.headers.get('location')!;

    expect(location).toContain(`/storage/v1/object/sign/${STORAGE_BUCKET}/`);
    expect(location).not.toContain('download=');

    const file = await fetch(location);

    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toContain('application/pdf');
    expect(file.headers.get('content-disposition')).toBeNull();
    expect(await file.text()).toContain('%PDF-1.4');
  });

  it('downloads a Word file under its title', async () => {
    signInAs(owner);

    const response = await GET(request(docxId), context(docxId));
    const file = await fetch(response.headers.get('location')!);

    expect(file.status).toBe(200);
    expect(file.headers.get('content-disposition')).toContain('attachment');
    expect(file.headers.get('content-disposition')).toContain('Handbook.docx');
  });

  it('shows Markdown and pasted text as plain text the browser displays', async () => {
    signInAs(owner);

    for (const [id, name, text] of [
      [markdownId, 'limits.md', 'Five projects per workspace.'],
      [pastedId, 'Refund policy.md', 'Within 30 days.'],
    ] as const) {
      const response = await GET(request(id), context(id));

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(response.headers.get('content-disposition')).toBe(
        `inline; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      );
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('content-security-policy')).toContain('sandbox');
      expect(await response.text()).toContain(text);
    }
  });

  it('says a website has no stored file', async () => {
    signInAs(owner);

    const response = await GET(request(websiteId), context(websiteId));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'This source is a website, so it has no stored file. Open its pages instead.',
    });
  });

  it('says so when the stored file has gone missing', async () => {
    const id = await addFile({
      kind: 'upload',
      title: 'gone.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      body: '%PDF-1.4',
    });

    await service.storage.from(STORAGE_BUCKET).remove([paths.at(-1)!]);
    signInAs(owner);

    const response = await GET(request(id), context(id));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'The stored file is missing. Delete this source and upload it again.',
    });
  });
});
