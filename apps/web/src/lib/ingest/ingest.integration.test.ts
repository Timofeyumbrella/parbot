// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStubProvider } from '@/lib/ai';
import type { Database } from '@/lib/db';

import type { FetchImpl } from './http';
import { ingestSource, STORAGE_BUCKET } from './index';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_USER = '00000000-0000-4000-8000-000000000001';

const html = (title: string, body: string) =>
  new Response(`<html><head><title>${title}</title></head><body><nav>menu</nav><main>${body}</main></body></html>`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });

const siteV1: Record<string, () => Response> = {
  'https://docs.test/guide/intro': () =>
    html('Intro', '<h1>Intro</h1><p>Parbot answers from your docs.</p><a href="setup">Setup</a><a href="/pricing">Pricing</a>'),
  'https://docs.test/guide/setup': () => html('Setup', '<h1>Setup</h1><p>Install the widget with one script tag.</p>'),
  'https://docs.test/pricing': () => html('Pricing', '<h1>Pricing</h1><p>Out of scope.</p>'),
};

const siteV2: Record<string, () => Response> = {
  'https://docs.test/guide/intro': () =>
    html('Intro', '<h1>Intro</h1><p>Parbot answers from your docs, with citations.</p><a href="faq">FAQ</a>'),
  'https://docs.test/guide/faq': () => html('FAQ', '<h1>FAQ</h1><p>Questions people ask about the widget.</p>'),
};

const serve =
  (site: Record<string, () => Response>): FetchImpl =>
  async (input) =>
    site[String(input)]?.() ?? new Response('missing', { status: 404 });

// Runs against the local Supabase stack; skipped where there is none.
describe.skipIf(!serviceKey)('ingestSource against the local database', () => {
  const service = createClient<Database>(url, serviceKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const provider = createStubProvider();
  let assistantId = '';
  let textPath = '';

  const createSource = async (row: Omit<Database['public']['Tables']['sources']['Insert'], 'assistant_id' | 'owner_id'>) => {
    const { data, error } = await service
      .from('sources')
      .insert({ assistant_id: assistantId, owner_id: DEMO_USER, ...row })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'no source');
    }

    return data.id;
  };

  const loadSource = async (id: string) => {
    const { data } = await service.from('sources').select('*').eq('id', id).single();

    return data!;
  };

  const loadDocuments = async (sourceId: string) => {
    const { data } = await service.from('documents').select('id, url, title, checksum').eq('source_id', sourceId).order('url');

    return data ?? [];
  };

  beforeAll(async () => {
    const { data, error } = await service
      .from('assistants')
      .insert({ owner_id: DEMO_USER, name: 'Ingest test', slug: `ingest-${Date.now().toString(36)}` })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'no assistant');
    }

    assistantId = data.id;
  });

  afterAll(async () => {
    if (textPath) {
      await service.storage.from(STORAGE_BUCKET).remove([textPath]);
    }

    if (assistantId) {
      await service.from('assistants').delete().eq('id', assistantId);
    }
  });

  it('crawls a website, writes documents and chunks, and re-indexes only what changed', async () => {
    const sourceId = await createSource({ kind: 'url', title: 'Docs', uri: 'https://docs.test/guide/intro' });

    const first = await ingestSource({ service, provider, sourceId, fetchImpl: serve(siteV1) });

    expect(first).toEqual({ status: 'ready', pages: 2, documents: 2, chunks: expect.any(Number), unchanged: 0 });

    const ready = await loadSource(sourceId);

    expect(ready).toMatchObject({ status: 'ready', error: null, pages_found: 2, pages_done: 2, document_count: 2 });
    expect(ready.chunk_count).toBeGreaterThanOrEqual(2);
    expect(ready.last_indexed_at).not.toBeNull();

    const documents = await loadDocuments(sourceId);

    expect(documents.map((document) => document.url)).toEqual(['https://docs.test/guide/intro', 'https://docs.test/guide/setup']);
    expect(documents.map((document) => document.title)).toEqual(['Intro', 'Setup']);

    const { data: chunks } = await service
      .from('chunks')
      .select('document_id, position, heading, content, token_count')
      .in(
        'document_id',
        documents.map((document) => document.id),
      )
      .order('position');

    expect(chunks?.length).toBe(ready.chunk_count);
    expect(chunks?.every((chunk) => chunk.token_count > 0)).toBe(true);
    expect(chunks?.find((chunk) => chunk.content.includes('one script tag'))?.heading).toBe('Setup');

    // Same content again: nothing is rewritten.
    const setupId = documents[1]!.id;
    const again = await ingestSource({ service, provider, sourceId, fetchImpl: serve(siteV1) });

    expect(again).toMatchObject({ status: 'ready', unchanged: 2, documents: 2 });
    expect((await loadDocuments(sourceId)).map((document) => document.id)).toEqual(documents.map((document) => document.id));

    // Intro changed, setup vanished, faq is new.
    const changed = await ingestSource({ service, provider, sourceId, fetchImpl: serve(siteV2) });

    expect(changed).toMatchObject({ status: 'ready', pages: 2, documents: 2, unchanged: 0 });

    const after = await loadDocuments(sourceId);

    expect(after.map((document) => document.url)).toEqual(['https://docs.test/guide/faq', 'https://docs.test/guide/intro']);
    expect(after.some((document) => document.id === setupId)).toBe(false);
    expect(after.find((document) => document.url === 'https://docs.test/guide/intro')?.id).not.toBe(documents[0]!.id);
    expect((await loadSource(sourceId)).document_count).toBe(2);
  });

  it('fails with a readable reason when no page can be read and keeps the row consistent', async () => {
    const sourceId = await createSource({ kind: 'url', title: 'Broken', uri: 'https://docs.test/missing/page' });

    const result = await ingestSource({ service, provider, sourceId, fetchImpl: serve(siteV1) });

    expect(result).toEqual({ status: 'failed', error: expect.stringContaining('HTTP 404') });

    const failed = await loadSource(sourceId);

    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('No pages could be read.');
    expect(failed.document_count).toBe(0);
  });

  it('indexes pasted text from the bucket with the heading as the title', async () => {
    textPath = `${DEMO_USER}/${assistantId}/${crypto.randomUUID()}.md`;

    const { error: uploadError } = await service.storage
      .from(STORAGE_BUCKET)
      .upload(textPath, new Blob(['# Refund policy\n\nRefunds are issued within 30 days of purchase.'], { type: 'text/markdown' }), {
        contentType: 'text/markdown',
      });

    expect(uploadError).toBeNull();

    const sourceId = await createSource({ kind: 'text', title: 'Pasted', storage_path: textPath, mime_type: 'text/markdown' });
    const result = await ingestSource({ service, provider, sourceId });

    expect(result).toMatchObject({ status: 'ready', pages: 1, documents: 1 });

    const [document] = await loadDocuments(sourceId);

    expect(document).toMatchObject({ url: null, title: 'Refund policy' });
    expect((await loadSource(sourceId)).status).toBe('ready');
  });

  it('reports a source that does not exist', async () => {
    await expect(ingestSource({ service, provider, sourceId: crypto.randomUUID() })).resolves.toEqual({
      status: 'failed',
      error: 'That source does not exist.',
    });
  });
});
