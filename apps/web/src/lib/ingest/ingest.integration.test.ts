// @vitest-environment node
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStubProvider } from '@/lib/ai';
import type { Database } from '@/lib/db';
import { PLANS } from '@/lib/plans';
import { storagePathFor, UPLOAD_TYPES } from '@/lib/uploads';

import { minimalPdf } from './fixtures/pdf';
import { publicLookup } from './guard';
import type { FetchImpl } from './http';
import { ingestSource, PAGE_LIMIT_MESSAGE, STORAGE_BUCKET } from './index';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const html = (title: string, body: string) =>
  new Response(
    `<html><head><title>${title}</title></head><body><nav>menu</nav><main>${body}</main></body></html>`,
    {
      status: 200,
      headers: { 'content-type': 'text/html' },
    },
  );

const siteV1: Record<string, () => Response> = {
  'https://docs.test/guide/intro': () =>
    html(
      'Intro',
      '<h1>Intro</h1><p>Parbot answers from your docs.</p><a href="setup">Setup</a><a href="/pricing">Pricing</a>',
    ),
  'https://docs.test/guide/setup': () =>
    html('Setup', '<h1>Setup</h1><p>Install the widget with one script tag.</p>'),
  'https://docs.test/pricing': () => html('Pricing', '<h1>Pricing</h1><p>Out of scope.</p>'),
};

const siteV2: Record<string, () => Response> = {
  'https://docs.test/guide/intro': () =>
    html(
      'Intro',
      '<h1>Intro</h1><p>Parbot answers from your docs, with citations.</p><a href="faq">FAQ</a>',
    ),
  'https://docs.test/guide/faq': () =>
    html('FAQ', '<h1>FAQ</h1><p>Questions people ask about the widget.</p>'),
};

const siteWithBrokenLink: Record<string, () => Response> = {
  'https://docs.test/guide/intro': () =>
    html(
      'Intro | Docs',
      '<h1>Intro</h1><p>Parbot answers from your docs.</p><a href="missing">Missing</a><a href="setup">Setup</a>',
    ),
  'https://docs.test/guide/setup': () =>
    html('Setup | Docs', '<h1>Setup</h1><p>Install the widget with one script tag.</p>'),
};

/** A sitemap of `count` pages, each with its own paragraph, to push the id lists past one request. */
const bigSite = (count: number, prefix: string, sitemap = 'https://docs.test/sitemap.xml') => {
  const site: Record<string, () => Response> = {};
  const locs: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const page = `https://docs.test/${prefix}/page-${index}`;

    locs.push(`<url><loc>${page}</loc></url>`);
    site[page] = () =>
      html(
        `Page ${index}`,
        `<h1>Page ${index}</h1><p>Paragraph number ${index} of the ${prefix} manual.</p>`,
      );
  }

  site[sitemap] = () =>
    new Response(`<urlset>${locs.join('')}</urlset>`, {
      status: 200,
      headers: { 'content-type': 'application/xml' },
    });

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

  type SourceRow = Omit<
    Database['public']['Tables']['sources']['Insert'],
    'assistant_id' | 'owner_id'
  >;

  const createSourceFor = async (owner: string, assistant: string, row: SourceRow) => {
    const { data, error } = await service
      .from('sources')
      .insert({ assistant_id: assistant, owner_id: owner, ...row })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'no source');
    }

    return data.id;
  };

  const createSource = (row: SourceRow) => createSourceFor(userId, assistantId, row);

  /** A user of its own with one assistant: the shared demo account's page count cannot interfere. */
  const createAccount = async (plan: Database['public']['Enums']['plan_id']) => {
    const stamp = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
    const { data: created, error: userError } = await service.auth.admin.createUser({
      email: `ingest-${stamp}@test.parbot.dev`,
      password: `pw-${crypto.randomUUID()}`,
      email_confirm: true,
    });

    if (userError || !created.user) {
      throw new Error(userError?.message ?? 'no user');
    }

    const owner = created.user.id;
    const { error: planError } = await service
      .from('subscriptions')
      .update({ plan_id: plan, billing_interval: 'monthly', status: 'active' })
      .eq('account_id', owner);

    if (planError) {
      throw new Error(planError.message);
    }

    const { data, error } = await service
      .from('assistants')
      .insert({ owner_id: owner, name: 'Ingest test', slug: `ingest-${stamp}` })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'no assistant');
    }

    return { owner, assistant: data.id };
  };

  const countDocuments = async (owner: string) => {
    const { count } = await service
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', owner);

    return count ?? 0;
  };

  const loadSource = async (id: string) => {
    const { data } = await service.from('sources').select('*').eq('id', id).single();

    return data!;
  };

  const loadDocuments = async (sourceId: string) => {
    const { data } = await service
      .from('documents')
      .select('id, url, title, checksum')
      .eq('source_id', sourceId)
      .order('url');

    return data ?? [];
  };

  beforeAll(async () => {
    ({ owner: userId, assistant: assistantId } = await createAccount('growth'));
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
    const sourceId = await createSource({
      kind: 'url',
      title: 'docs.test/guide/intro',
      uri: 'https://docs.test/guide/intro',
    });

    const first = await ingestSource({
      service,
      provider,
      sourceId,
      fetchImpl: serve(siteV1),
      lookup,
    });

    expect(first).toEqual({
      status: 'ready',
      pages: 2,
      documents: 2,
      chunks: expect.any(Number),
      unchanged: 0,
      note: null,
    });

    const ready = await loadSource(sourceId);

    expect(ready).toMatchObject({
      status: 'ready',
      error: null,
      pages_found: 2,
      pages_done: 2,
      document_count: 2,
    });
    // The website was named after its address; the start page's title is better.
    expect(ready.title).toBe('Intro');
    expect(ready.chunk_count).toBeGreaterThanOrEqual(2);
    expect(ready.last_indexed_at).not.toBeNull();

    const documents = await loadDocuments(sourceId);

    expect(documents.map((document) => document.url)).toEqual([
      'https://docs.test/guide/intro',
      'https://docs.test/guide/setup',
    ]);
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
    expect(chunks?.find((chunk) => chunk.content.includes('one script tag'))?.heading).toBe(
      'Setup',
    );

    // Same content again: nothing is rewritten.
    const setupId = documents[1]!.id;
    const again = await ingestSource({
      service,
      provider,
      sourceId,
      fetchImpl: serve(siteV1),
      lookup,
    });

    expect(again).toMatchObject({ status: 'ready', unchanged: 2, documents: 2 });
    expect((await loadDocuments(sourceId)).map((document) => document.id)).toEqual(
      documents.map((document) => document.id),
    );

    // Intro changed, setup vanished, faq is new.
    const changed = await ingestSource({
      service,
      provider,
      sourceId,
      fetchImpl: serve(siteV2),
      lookup,
    });

    expect(changed).toMatchObject({ status: 'ready', pages: 2, documents: 2, unchanged: 0 });

    const after = await loadDocuments(sourceId);

    expect(after.map((document) => document.url)).toEqual([
      'https://docs.test/guide/faq',
      'https://docs.test/guide/intro',
    ]);
    expect(after.some((document) => document.id === setupId)).toBe(false);
    expect(after.find((document) => document.url === 'https://docs.test/guide/intro')?.id).not.toBe(
      documents[0]!.id,
    );
    expect((await loadSource(sourceId)).document_count).toBe(2);
  });

  it('keeps a title the person chose and notes pages that could not be read', async () => {
    const sourceId = await createSource({
      kind: 'url',
      title: 'Our docs',
      uri: 'https://docs.test/guide/intro',
    });

    const result = await ingestSource({
      service,
      provider,
      sourceId,
      fetchImpl: serve(siteWithBrokenLink),
      lookup,
    });

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
    expect((await loadDocuments(sourceId)).map((document) => document.title)).toEqual([
      'Intro',
      'Setup',
    ]);
  });

  it('says when the run stopped at its page limit', async () => {
    const sourceId = await createSource({
      kind: 'url',
      title: 'Capped',
      uri: 'https://docs.test/guide/intro',
    });

    const result = await ingestSource({
      service,
      provider,
      sourceId,
      fetchImpl: serve(siteV1),
      lookup,
      pageLimit: 1,
    });

    expect(result).toMatchObject({
      status: 'ready',
      pages: 1,
      note: expect.stringContaining('Stopped after 1 page'),
    });
  });

  it('steps aside when another run holds the source', async () => {
    const sourceId = await createSource({
      kind: 'url',
      title: 'Busy',
      uri: 'https://docs.test/guide/intro',
      status: 'indexing',
      pages_found: 7,
    });

    await expect(
      ingestSource({ service, provider, sourceId, fetchImpl: serve(siteV1), lookup }),
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'This source is being indexed by another run.',
    });
    expect(await loadSource(sourceId)).toMatchObject({ status: 'indexing', pages_found: 7 });
  });

  it('fails with a readable reason when no page can be read and keeps the row consistent', async () => {
    const sourceId = await createSource({
      kind: 'url',
      title: 'Broken',
      uri: 'https://docs.test/missing/page',
    });

    const result = await ingestSource({
      service,
      provider,
      sourceId,
      fetchImpl: serve(siteV1),
      lookup,
    });

    expect(result).toEqual({ status: 'failed', error: expect.stringContaining('HTTP 404') });

    const failed = await loadSource(sourceId);

    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('No pages could be read.');
    expect(failed.document_count).toBe(0);
  });

  it('refuses a start page on a private network', async () => {
    const sourceId = await createSource({
      kind: 'url',
      title: 'Inside',
      uri: 'http://127.0.0.1:54321/guide',
    });

    const result = await ingestSource({
      service,
      provider,
      sourceId,
      fetchImpl: serve(siteV1),
      lookup,
    });

    expect(result).toEqual({
      status: 'failed',
      error:
        'No pages could be read. Could not fetch http://127.0.0.1:54321/guide: the address points at a private or internal network.',
    });
  });

  it('indexes pasted text from the bucket under the title the person gave it', async () => {
    const textPath = `${userId}/${assistantId}/${crypto.randomUUID()}.md`;

    storagePaths.push(textPath);

    const { error: uploadError } = await service.storage.from(STORAGE_BUCKET).upload(
      textPath,
      new Blob(['# Refund policy\n\nRefunds are issued within 30 days of purchase.'], {
        type: 'text/markdown',
      }),
      {
        contentType: 'text/markdown',
      },
    );

    expect(uploadError).toBeNull();

    const sourceId = await createSource({
      kind: 'text',
      title: 'Refunds (pasted)',
      storage_path: textPath,
      mime_type: 'text/markdown',
    });
    const result = await ingestSource({ service, provider, sourceId });

    expect(result).toMatchObject({ status: 'ready', pages: 1, documents: 1 });

    const [document] = await loadDocuments(sourceId);

    expect(document).toMatchObject({ url: null, title: 'Refunds (pasted)' });
    expect((await loadSource(sourceId)).status).toBe('ready');
  });

  it.each([
    {
      type: 'docx' as const,
      fileName: 'handbook.docx',
      bytes: () =>
        new Uint8Array(readFileSync(new URL('./fixtures/handbook.docx', import.meta.url))),
      title: 'Handbook',
      passage: 'Refunds are issued within 30 days of purchase.',
    },
    {
      type: 'pdf' as const,
      fileName: 'guide.pdf',
      bytes: () => minimalPdf('Hello Parbot', 'Welcome guide'),
      title: 'Welcome guide',
      passage: 'Hello Parbot',
    },
  ])(
    'indexes an uploaded $type file from the bucket under the title inside it',
    async ({ type, fileName, bytes, title, passage }) => {
      // Stored the way POST /api/sources stores an upload: under the account, typed by its extension.
      const spec = UPLOAD_TYPES[type];
      const path = storagePathFor(userId, assistantId, spec.extensions[0]!);

      storagePaths.push(path);

      const { error: uploadError } = await service.storage
        .from(STORAGE_BUCKET)
        .upload(path, new Blob([bytes()], { type: spec.mime }), { contentType: spec.mime });

      expect(uploadError).toBeNull();

      const sourceId = await createSource({
        kind: 'upload',
        title: fileName,
        storage_path: path,
        mime_type: spec.mime,
      });
      const result = await ingestSource({ service, provider, sourceId });

      expect(result).toMatchObject({ status: 'ready', pages: 1, documents: 1, note: null });

      const [document] = await loadDocuments(sourceId);

      expect(document).toMatchObject({ url: null, title });

      const { data: chunks } = await service
        .from('chunks')
        .select('content')
        .eq('document_id', document!.id);

      expect(chunks?.some((chunk) => chunk.content.includes(passage))).toBe(true);
      expect(await loadSource(sourceId)).toMatchObject({
        status: 'ready',
        error: null,
        pages_done: 1,
        document_count: 1,
        chunk_count: chunks?.length,
      });
    },
  );

  it('reports a source that does not exist', async () => {
    await expect(
      ingestSource({ service, provider, sourceId: crypto.randomUUID() }),
    ).resolves.toEqual({
      status: 'failed',
      error: 'That source does not exist.',
    });
  });

  it(
    'handles a sitemap of a few hundred pages, counting and removing them in batches',
    { timeout: 120_000 },
    async () => {
      const sourceId = await createSource({
        kind: 'sitemap',
        title: 'docs.test',
        uri: 'https://docs.test/sitemap.xml',
      });

      const first = await ingestSource({
        service,
        provider,
        sourceId,
        fetchImpl: serve(bigSite(260, 'v1')),
        lookup,
      });

      expect(first).toMatchObject({ status: 'ready', pages: 260, documents: 260, note: null });
      expect(first.status === 'ready' && first.chunks).toBe(260);

      const ready = await loadSource(sourceId);

      expect(ready).toMatchObject({ status: 'ready', document_count: 260, chunk_count: 260 });

      // Every page moved: 260 stale rows go in batches the gateway accepts.
      const second = await ingestSource({
        service,
        provider,
        sourceId,
        fetchImpl: serve(bigSite(3, 'v2')),
        lookup,
      });

      expect(second).toMatchObject({
        status: 'ready',
        pages: 3,
        documents: 3,
        chunks: 3,
        unchanged: 0,
      });
      expect(await loadSource(sourceId)).toMatchObject({
        status: 'ready',
        document_count: 3,
        chunk_count: 3,
      });
    },
  );

  it(
    'holds the plan limit when two sources of one account index at the same time',
    { timeout: 120_000 },
    async () => {
      // Two Add source submissions run side by side through after(); each once saw the full allowance.
      const account = await createAccount('hobby');

      try {
        const [first, second] = await Promise.all([
          createSourceFor(account.owner, account.assistant, {
            kind: 'sitemap',
            title: 'A',
            uri: 'https://docs.test/a/sitemap.xml',
          }),
          createSourceFor(account.owner, account.assistant, {
            kind: 'sitemap',
            title: 'B',
            uri: 'https://docs.test/b/sitemap.xml',
          }),
        ]);
        const results = await Promise.all([
          ingestSource({
            service,
            provider,
            sourceId: first,
            fetchImpl: serve(bigSite(70, 'a', 'https://docs.test/a/sitemap.xml')),
            lookup,
          }),
          ingestSource({
            service,
            provider,
            sourceId: second,
            fetchImpl: serve(bigSite(70, 'b', 'https://docs.test/b/sitemap.xml')),
            lookup,
          }),
        ]);

        expect(results.map((result) => result.status)).toEqual(['ready', 'ready']);
        expect(await countDocuments(account.owner)).toBe(PLANS.hobby.pages);

        const notes = results.map((result) => (result.status === 'ready' ? result.note : null));

        expect(notes.some((note) => note?.includes("Stopped at your plan's page limit"))).toBe(
          true,
        );

        // The rows agree with the table: pages_done and document_count are what was really written.
        const rows = await Promise.all([loadSource(first), loadSource(second)]);

        expect(rows.reduce((sum, row) => sum + row.document_count, 0)).toBe(PLANS.hobby.pages);
        expect(
          rows.every((row) => row.status === 'ready' && row.pages_done === row.document_count),
        ).toBe(true);
      } finally {
        await service.auth.admin.deleteUser(account.owner);
      }
    },
  );

  describe('when another run fills the allowance while this one crawls', () => {
    const sitemap = 'https://docs.test/late/sitemap.xml';

    /** Writes `count` pages for the account the moment the crawl starts, after the first look at the limit. */
    const otherRunWrites = (
      account: { owner: string; assistant: string },
      count: number,
      fetchImpl: FetchImpl,
    ): FetchImpl => {
      let written: Promise<void> | null = null;

      const write = async () => {
        const other = await createSourceFor(account.owner, account.assistant, {
          kind: 'text',
          title: 'Other run',
          storage_path: `${account.owner}/other.md`,
        });
        const rows = Array.from({ length: count }, (_, index) => ({
          assistant_id: account.assistant,
          owner_id: account.owner,
          source_id: other,
          title: `Other ${index}`,
          content: `Other page ${index}.`,
          checksum: `other-${index}`,
        }));
        const { error } = await service.from('documents').insert(rows);

        if (error) {
          throw new Error(error.message);
        }
      };

      return async (input, init) => {
        written ??= write();
        await written;

        return fetchImpl(input, init);
      };
    };

    it(
      'indexes what still fits and says it stopped at the plan limit',
      { timeout: 60_000 },
      async () => {
        const account = await createAccount('hobby');

        try {
          const sourceId = await createSourceFor(account.owner, account.assistant, {
            kind: 'sitemap',
            title: 'Late',
            uri: sitemap,
          });
          const fetchImpl = otherRunWrites(
            account,
            PLANS.hobby.pages - 10,
            serve(bigSite(20, 'late', sitemap)),
          );
          const result = await ingestSource({ service, provider, sourceId, fetchImpl, lookup });

          expect(result).toMatchObject({
            status: 'ready',
            pages: 10,
            documents: 10,
            note: "Stopped at your plan's page limit after 10 pages. Upgrade on the Billing page or remove a source to index the rest.",
          });
          expect(await loadSource(sourceId)).toMatchObject({
            status: 'ready',
            pages_done: 10,
            document_count: 10,
          });
          expect(await countDocuments(account.owner)).toBe(PLANS.hobby.pages);
        } finally {
          await service.auth.admin.deleteUser(account.owner);
        }
      },
    );

    it(
      'fails with the plan-limit message when no page fits any more',
      { timeout: 60_000 },
      async () => {
        const account = await createAccount('hobby');

        try {
          const sourceId = await createSourceFor(account.owner, account.assistant, {
            kind: 'sitemap',
            title: 'Late',
            uri: sitemap,
          });
          const fetchImpl = otherRunWrites(
            account,
            PLANS.hobby.pages,
            serve(bigSite(5, 'late', sitemap)),
          );
          const result = await ingestSource({ service, provider, sourceId, fetchImpl, lookup });

          expect(result).toEqual({ status: 'failed', error: PAGE_LIMIT_MESSAGE });
          expect(await loadSource(sourceId)).toMatchObject({
            status: 'failed',
            error: PAGE_LIMIT_MESSAGE,
            document_count: 0,
          });
          expect(await countDocuments(account.owner)).toBe(PLANS.hobby.pages);
        } finally {
          await service.auth.admin.deleteUser(account.owner);
        }
      },
    );
  });
});
