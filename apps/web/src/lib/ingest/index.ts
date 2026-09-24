import type { SupabaseClient } from '@supabase/supabase-js';

import type { AiProvider, EmbedInput } from '@/lib/ai';
import type { Database, Source } from '@/lib/db';
import { checkCapacity } from '@/lib/plans';
import { uploadTypeFor } from '@/lib/uploads';

import { type Chunk, chunkMarkdown, estimateTokens } from './chunk';
import { crawlPages, crawlScope } from './crawl';
import { checksumOf, extractText, extractUpload } from './extract';
import type { FetchImpl } from './http';
import { discoverSitemapUrls } from './sitemap';

export type ServiceClient = SupabaseClient<Database>;

export type IngestParams = {
  service: ServiceClient;
  provider: AiProvider;
  sourceId: string;
  fetchImpl?: FetchImpl;
  /** Upper bound on pages per run. The plan's remaining pages can lower it, never raise it. */
  pageLimit?: number;
};

export type IngestResult =
  | { status: 'ready'; pages: number; documents: number; chunks: number; unchanged: number }
  | { status: 'failed'; error: string };

export const MAX_PAGES_PER_RUN = 300;
export const EMBED_BATCH_SIZE = 32;
export const STORAGE_BUCKET = 'sources';
export const PAGE_LIMIT_MESSAGE =
  "Your plan's page limit is reached. Upgrade on the Billing page or remove a source.";

type SourceUpdate = Database['public']['Tables']['sources']['Update'];

type Page = { url: string | null; title: string | null; markdown: string };

/** Counters are written in the background and coalesced, so crawling never waits on the database. */
const createProgress = (service: ServiceClient, sourceId: string) => {
  let pending: SourceUpdate = {};
  let inflight: Promise<void> | null = null;

  const write = async () => {
    while (Object.keys(pending).length > 0) {
      const update = pending;

      pending = {};
      await service.from('sources').update(update).eq('id', sourceId);
    }

    inflight = null;
  };

  return {
    set: (fields: SourceUpdate) => {
      pending = { ...pending, ...fields };
      inflight ??= write();
    },
    flush: async () => {
      while (inflight) {
        await inflight;
      }
    },
  };
};

const humanize = (cause: unknown) => {
  const message = cause instanceof Error ? cause.message.trim() : '';

  return (message || 'Something went wrong while indexing. Try again.').slice(0, 500);
};

const readStorageObject = async (service: ServiceClient, path: string) => {
  const { data, error } = await service.storage.from(STORAGE_BUCKET).download(path);

  if (error || !data) {
    throw new Error(`The uploaded file could not be read from storage${error ? ` (${error.message})` : ''}.`);
  }

  return new Uint8Array(await data.arrayBuffer());
};

/** Pages the account may still add: the plan's allowance minus documents outside this source. */
const remainingPages = async (service: ServiceClient, source: Pick<Source, 'id' | 'owner_id'>) => {
  const [{ data: subscription }, account, own] = await Promise.all([
    service.from('subscriptions').select('plan_id, status').eq('account_id', source.owner_id).maybeSingle(),
    service.from('documents').select('id', { count: 'exact', head: true }).eq('owner_id', source.owner_id),
    service.from('documents').select('id', { count: 'exact', head: true }).eq('source_id', source.id),
  ]);
  const planId = subscription?.status === 'canceled' ? 'hobby' : (subscription?.plan_id ?? 'hobby');
  const used = Math.max((account.count ?? 0) - (own.count ?? 0), 0);

  return checkCapacity(planId, used, 'pages');
};

const discoverPages = async (
  service: ServiceClient,
  source: Source,
  pageLimit: number,
  fetchImpl: FetchImpl,
  onFound: (count: number) => void,
): Promise<{ pages: Page[]; problems: string[] }> => {
  switch (source.kind) {
    case 'url':
    case 'sitemap': {
      const uri = source.uri ?? '';
      const seeds = source.kind === 'url' ? [uri] : await discoverSitemapUrls({ url: uri, fetchImpl, limit: pageLimit });

      if (seeds.length === 0) {
        throw new Error('The sitemap lists no pages.');
      }

      let found = 0;
      const result = await crawlPages({
        seeds,
        scope: source.kind === 'url' ? crawlScope(uri) : null,
        pageLimit,
        fetchImpl,
        onPage: () => {
          found += 1;
          onFound(found);
        },
      });

      return {
        pages: result.pages.map((page) => ({ url: page.url, title: page.title, markdown: page.markdown })),
        problems: result.errors.map((error) => error.message),
      };
    }
    case 'upload': {
      const path = source.storage_path ?? '';
      const type = uploadTypeFor(path, source.mime_type);

      if (!type) {
        throw new Error('This file type is not supported. Upload a PDF, Word, HTML, Markdown or text file.');
      }

      const extracted = await extractUpload(await readStorageObject(service, path), type);

      onFound(1);

      return { pages: [{ url: null, ...extracted }], problems: [] };
    }
    case 'text': {
      const extracted = extractText(await readStorageObject(service, source.storage_path ?? ''));

      onFound(1);

      return { pages: [{ url: null, ...extracted }], problems: [] };
    }
  }
};

const embedChunks = async (provider: AiProvider, chunks: Chunk[], title: string) => {
  const vectors: number[][] = [];

  for (let start = 0; start < chunks.length; start += EMBED_BATCH_SIZE) {
    const batch: EmbedInput[] = chunks.slice(start, start + EMBED_BATCH_SIZE).map((chunk) => ({
      text: chunk.heading ? `${chunk.heading}\n${chunk.content}` : chunk.content,
      title,
    }));
    const embedded = await provider.embed(batch, 'document');

    if (embedded.length !== batch.length) {
      throw new Error('The embedding provider returned the wrong number of vectors.');
    }

    vectors.push(...embedded);
  }

  return vectors;
};

/**
 * Indexes one source end to end: discovers its pages, turns them into Markdown, chunks and embeds
 * them and writes documents and chunks. Progress and the outcome land on the source row, so the
 * Knowledge screen can follow along. Never throws; failures are reported on the row and returned.
 */
export const ingestSource = async (params: IngestParams): Promise<IngestResult> => {
  const { service, provider, sourceId, fetchImpl = fetch } = params;
  const progress = createProgress(service, sourceId);

  const update = async (fields: SourceUpdate) => {
    await progress.flush();

    const { error } = await service.from('sources').update(fields).eq('id', sourceId);

    if (error) {
      throw new Error(`The source could not be updated (${error.message}).`);
    }
  };

  const { data: source, error: loadError } = await service.from('sources').select('*').eq('id', sourceId).maybeSingle();

  if (loadError || !source) {
    return { status: 'failed', error: loadError ? humanize(new Error(loadError.message)) : 'That source does not exist.' };
  }

  try {
    const capacity = await remainingPages(service, source);

    if (capacity.remaining <= 0) {
      throw new Error(PAGE_LIMIT_MESSAGE);
    }

    const pageLimit = Math.max(1, Math.min(capacity.remaining, params.pageLimit ?? MAX_PAGES_PER_RUN, MAX_PAGES_PER_RUN));

    await update({ status: 'crawling', error: null, pages_found: 0, pages_done: 0 });

    const { pages, problems } = await discoverPages(service, source, pageLimit, fetchImpl, (count) =>
      progress.set({ pages_found: count }),
    );

    if (pages.length === 0) {
      throw new Error(problems[0] ? `No pages could be read. ${problems[0]}` : 'No readable content was found.');
    }

    await update({ status: 'indexing', pages_found: pages.length, pages_done: 0 });

    const { data: existing, error: existingError } = await service
      .from('documents')
      .select('id, url, checksum')
      .eq('source_id', sourceId);

    if (existingError) {
      throw new Error(`Existing pages could not be loaded (${existingError.message}).`);
    }

    const keyOf = (url: string | null) => url ?? '';
    const previousByKey = new Map((existing ?? []).map((document) => [keyOf(document.url), document]));
    const seen = new Set<string>();
    let done = 0;
    let unchanged = 0;

    for (const page of pages) {
      const key = keyOf(page.url);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      const checksum = checksumOf(page.markdown);
      const previous = previousByKey.get(key);

      if (previous?.checksum === checksum) {
        unchanged += 1;
        done += 1;
        progress.set({ pages_done: done });
        continue;
      }

      const title = (page.title ?? source.title).slice(0, 200);
      const chunks = chunkMarkdown(page.markdown);

      if (chunks.length === 0) {
        seen.delete(key);
        continue;
      }

      const vectors = await embedChunks(provider, chunks, title);

      if (previous) {
        const { error } = await service.from('documents').delete().eq('id', previous.id);

        if (error) {
          throw new Error(`An old page could not be replaced (${error.message}).`);
        }
      }

      const { data: document, error: documentError } = await service
        .from('documents')
        .insert({
          assistant_id: source.assistant_id,
          owner_id: source.owner_id,
          source_id: source.id,
          url: page.url,
          title,
          content: page.markdown,
          checksum,
          token_count: estimateTokens(page.markdown),
        })
        .select('id')
        .single();

      if (documentError || !document) {
        throw new Error(`A page could not be saved (${documentError?.message ?? 'no row returned'}).`);
      }

      const rows = chunks.map((chunk, position) => ({
        assistant_id: source.assistant_id,
        owner_id: source.owner_id,
        document_id: document.id,
        position,
        heading: chunk.heading,
        content: chunk.content,
        token_count: chunk.tokenCount,
        embedding: JSON.stringify(vectors[position]),
      }));

      for (let start = 0; start < rows.length; start += EMBED_BATCH_SIZE) {
        const { error } = await service.from('chunks').insert(rows.slice(start, start + EMBED_BATCH_SIZE));

        if (error) {
          // A document without its chunks would be invisible to retrieval; leave nothing behind.
          await service.from('documents').delete().eq('id', document.id);
          throw new Error(`Passages could not be saved (${error.message}).`);
        }
      }

      done += 1;
      progress.set({ pages_done: done });
    }

    const stale = (existing ?? []).filter((document) => !seen.has(keyOf(document.url)));

    if (stale.length > 0) {
      const { error } = await service
        .from('documents')
        .delete()
        .in(
          'id',
          stale.map((document) => document.id),
        );

      if (error) {
        throw new Error(`Removed pages could not be cleaned up (${error.message}).`);
      }
    }

    const { data: documents } = await service.from('documents').select('id').eq('source_id', sourceId);
    const documentIds = (documents ?? []).map((document) => document.id);
    const { count } =
      documentIds.length > 0
        ? await service.from('chunks').select('id', { count: 'exact', head: true }).in('document_id', documentIds)
        : { count: 0 };
    const chunkCount = count ?? 0;

    await update({
      status: 'ready',
      error: null,
      pages_found: pages.length,
      pages_done: done,
      chunk_count: chunkCount,
      last_indexed_at: new Date().toISOString(),
    });

    return { status: 'ready', pages: pages.length, documents: documentIds.length, chunks: chunkCount, unchanged };
  } catch (cause) {
    const error = humanize(cause);

    try {
      await update({ status: 'failed', error });
    } catch {
      // The row could not be updated; the caller still learns what happened from the result.
    }

    return { status: 'failed', error };
  }
};

export { type Chunk, chunkMarkdown, estimateTokens } from './chunk';
export { crawlableLinks, crawlPages, crawlScope, isInScope, normalizeUrl } from './crawl';
export { checksumOf, extractText, extractUpload } from './extract';
export { htmlToMarkdown } from './html';
export { type FetchImpl, FetchPageError } from './http';
export { discoverSitemapUrls, parseSitemap } from './sitemap';
