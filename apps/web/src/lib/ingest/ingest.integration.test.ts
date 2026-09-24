// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStubProvider } from '@/lib/ai';
import type { Database } from '@/lib/db';

import { publicLookup } from './guard';
import type { FetchImpl } from './http';
import { ingestSource, STORAGE_BUCKET } from './index';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

const siteWithBrokenLink: Record<string, () => Response> = {
  'https://docs.test/guide/intro': () =>
    html('Intro | Docs', '<h1>Intro</h1><p>Parbot answers from your docs.</p><a href="missing">Missing</a><a href="setup">Setup</a>'),
  'https://docs.test/guide/setup': () => html('Setup | Docs', '<h1>Setup</h1><p>Install the widget with one script tag.</p>'),
};

/** A sitemap of `count` pages, each with its own paragraph, to push the id lists past one request. */
const bigSite = (count: number, prefix: string) => {
  const site: Record<string, () => Response> = {};
  const locs: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const page = `https://docs.test/${prefix}/page-${index}`;

    locs.push(`<url><loc>${page}</loc></url>`);
    site[page] = () => html(`Page ${index}`, `<h1>Page ${index}</h1><p>Paragraph number ${index} of the ${prefix} manual.</p>`);
  }

  site['https://docs.test/sitemap.xml'] = () =>
    new Response(`<urlset>${locs.join('')}</urlset>`, { status: 200, headers: { 'content-type': 'application/xml' } });

  return site;
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
  const lookup = publicLookup;
  let userId = '';
  let assistantId = '';
  const storagePaths: string[] = [];

  const createSource = async (row: Omit<Database['public']['Tables']['sources']['Insert'], 'assistant_id' | 'owner_id'>) => {
    const { data, error } = await service
      .from('sources')
      .insert({ assistant_id: assistantId, owner_id: userId, ...row })
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
    // A user of its own on the Growth plan: the shared demo account's page count cannot interfere.
    const stamp = Date.now().toString(36);
    const { data: created, error: userError } = await service.auth.admin.createUser({
      email: `ingest-${stamp}@test.parbot.dev`,
      password: `pw-${crypto.randomUUID()}`,
      email_confirm: true,
    });

    if (userError || !created.user) {
      throw new Error(userError?.message ?? 'no user');
    }

    userId = created.user.id;

    const { error: planError } = await service
      .from('subscriptions')
      .update({ plan_id: 'growth', billing_interval: 'monthly', status: 'active' })
      .eq('account_id', userId);

    if (planError) {
      throw new Error(planError.message);
    }

    const { data, error } = await service
      .from('assistants')
      .insert({ owner_id: userId, name: 'Ingest test', slug: `ingest-${stamp}` })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'no assistant');
    }

    assistantId = data.id;
  });

  afterAll(async () => {
    if (storagePaths.length > 0) {
      await service.storage.from(STORAGE_BUCKET).remove(storagePaths);
    }

    if (userId) {
      // Cascades through profile, assistant, sources, documents and chunks.
      await service.auth.admin.deleteUser(userId);
    }
  });

  it('crawls a website, writes documents and chunks, and re-indexes only what changed', async () => {
    const sourceId = await createSource({ kind: 'url', title: 'docs.test/guide/intro', uri: 'https://docs.test/guide/intro' });

    const first = await ingestSource({ service, provider, sourceId, fetchImpl: serve(siteV1), lookup });

    expect(first).toEqual({ status: 'ready', pages: 2, documents: 2, chunks: expect.any(Number), unchanged: 0, note: null });

    const ready = await loadSource(sourceId);

    expect(ready).toMatchObject({ status: 'ready', error: null, pages_found: 2, pages_done: 2, document_count: 2 });
    // The website was named after its address; the start page's title is better.
    expect(ready.title).toBe('Intro');
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
    const again = await ingestSource({ service, provider, sourceId, fetchImpl: serve(siteV1), lookup });

    expect(again).toMatchObject({ status: 'ready', unchanged: 2, documents: 2 });
    expect((await loadDocuments(sourceId)).map((document) => document.id)).toEqual(documents.map((document) => document.id));

    // Intro changed, setup vanished, faq is new.
    const changed = await ingestSource({ service, provider, sourceId, fetchImpl: serve(siteV2), lookup });

    expect(changed).toMatchObject({ status: 'ready', pages: 2, documents: 2, unchanged: 0 });

    const after = await loadDocuments(sourceId);

    expect(after.map((document) => document.url)).toEqual(['https://docs.test/guide/faq', 'https://docs.test/guide/intro']);
    expect(after.some((document) => document.id === setupId)).toBe(false);
    expect(after.find((document) => document.url === 'https://docs.test/guide/intro')?.id).not.toBe(documents[0]!.id);
    expect((await loadSource(sourceId)).document_count).toBe(2);
  });

  it('keeps a title the person chose and notes pages that could not be read', async () => {
    const sourceId = await createSource({ kind: 'url', title: 'Our docs', uri: 'https://docs.test/guide/intro' });

    const result = await ingestSource({ service, provider, sourceId, fetchImpl: serve(siteWithBrokenLink), lookup });

    expect(result).toMatchObject({
      status: 'ready',
      pages: 2,
      note: '1 page could not be read. Could not fetch https://docs.test/guide/missing: HTTP 404.',
    });

    const ready = await loadSource(sourceId);

    expect(ready.title).toBe('Our docs');
    expect(ready.status).toBe('ready');
    expect(ready.error).toBe(result.status === 'ready' ? result.note : null);
    // The site suffix is gone from the page titles.
    expect((await loadDocuments(sourceId)).map((document) => document.title)).toEqual(['Intro', 'Setup']);
  });

  it('says when the run stopped at its page limit', async () => {
    const sourceId = await createSource({ kind: 'url', title: 'Capped', uri: 'https://docs.test/guide/intro' });

    const result = await ingestSource({ service, provider, sourceId, fetchImpl: serve(siteV1), lookup, pageLimit: 1 });

    expect(result).toMatchObject({ status: 'ready', pages: 1, note: expect.stringContaining('Stopped after 1 page') });
  });

  it('steps aside when another run holds the source', async () => {
    const sourceId = await createSource({ kind: 'url', title: 'Busy', uri: 'https://docs.test/guide/intro', status: 'indexing', pages_found: 7 });

    await expect(ingestSource({ service, provider, sourceId, fetchImpl: serve(siteV1), lookup })).resolves.toEqual({
      status: 'skipped',
      reason: 'This source is being indexed by another run.',
    });
    expect(await loadSource(sourceId)).toMatchObject({ status: 'indexing', pages_found: 7 });
  });

  it('fails with a readable reason when no page can be read and keeps the row consistent', async () => {
    const sourceId = await createSource({ kind: 'url', title: 'Broken', uri: 'https://docs.test/missing/page' });

    const result = await ingestSource({ service, provider, sourceId, fetchImpl: serve(siteV1), lookup });

    expect(result).toEqual({ status: 'failed', error: expect.stringContaining('HTTP 404') });

    const failed = await loadSource(sourceId);

    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('No pages could be read.');
    expect(failed.document_count).toBe(0);
  });

  it('refuses a start page on a private network', async () => {
    const sourceId = await createSource({ kind: 'url', title: 'Inside', uri: 'http://127.0.0.1:54321/guide' });

    const result = await ingestSource({ service, provider, sourceId, fetchImpl: serve(siteV1), lookup });

    expect(result).toEqual({
      status: 'failed',
      error: 'No pages could be read. Could not fetch http://127.0.0.1:54321/guide: the address points at a private or internal network.',
    });
  });

  it('indexes pasted text from the bucket under the title the person gave it', async () => {
    const textPath = `${userId}/${assistantId}/${crypto.randomUUID()}.md`;

    storagePaths.push(textPath);

    const { error: uploadError } = await service.storage
      .from(STORAGE_BUCKET)
      .upload(textPath, new Blob(['# Refund policy\n\nRefunds are issued within 30 days of purchase.'], { type: 'text/markdown' }), {
        contentType: 'text/markdown',
      });

    expect(uploadError).toBeNull();

    const sourceId = await createSource({ kind: 'text', title: 'Refunds (pasted)', storage_path: textPath, mime_type: 'text/markdown' });
    const result = await ingestSource({ service, provider, sourceId });

    expect(result).toMatchObject({ status: 'ready', pages: 1, documents: 1 });

    const [document] = await loadDocuments(sourceId);

    expect(document).toMatchObject({ url: null, title: 'Refunds (pasted)' });
    expect((await loadSource(sourceId)).status).toBe('ready');
  });

  it('reports a source that does not exist', async () => {
    await expect(ingestSource({ service, provider, sourceId: crypto.randomUUID() })).resolves.toEqual({
      status: 'failed',
      error: 'That source does not exist.',
    });
  });

  it('handles a sitemap of a few hundred pages, counting and removing them in batches', { timeout: 120_000 }, async () => {
    const sourceId = await createSource({ kind: 'sitemap', title: 'docs.test', uri: 'https://docs.test/sitemap.xml' });

    const first = await ingestSource({ service, provider, sourceId, fetchImpl: serve(bigSite(260, 'v1')), lookup });

    expect(first).toMatchObject({ status: 'ready', pages: 260, documents: 260, note: null });
    expect(first.status === 'ready' && first.chunks).toBe(260);

    const ready = await loadSource(sourceId);

    expect(ready).toMatchObject({ status: 'ready', document_count: 260, chunk_count: 260 });

    // Every page moved: 260 stale rows go in batches the gateway accepts.
    const second = await ingestSource({ service, provider, sourceId, fetchImpl: serve(bigSite(3, 'v2')), lookup });

    expect(second).toMatchObject({ status: 'ready', pages: 3, documents: 3, chunks: 3, unchanged: 0 });
    expect(await loadSource(sourceId)).toMatchObject({ status: 'ready', document_count: 3, chunk_count: 3 });
  });
});
