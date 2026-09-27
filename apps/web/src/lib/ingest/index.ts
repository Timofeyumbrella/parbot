import type { SupabaseClient } from '@supabase/supabase-js';

import { type AiProvider, type EmbedInput, ModelBusyError } from '@/lib/ai';
import { entitledPlanId } from '@/lib/billing/entitlement';
import type { Database, Source } from '@/lib/db';
import { formatCount, plural } from '@/lib/format';
import { checkCapacity } from '@/lib/plans';
import { STORAGE_BUCKET, uploadTypeFor } from '@/lib/uploads';

import { type Chunk, chunkMarkdown, estimateTokens } from './chunk';
import { crawlPages, crawlScope, normalizeUrl } from './crawl';
import { humanizeIngestError, IngestError, TIMED_OUT_FAILURE } from './errors';
import { checksumOf, extractText, extractUpload } from './extract';
import type { HostLookup } from './guard';
import type { FetchImpl } from './http';
import { isAutoLabel } from './label';
import { discoverSitemapUrls } from './sitemap';

export type ServiceClient = SupabaseClient<Database>;

export type IngestParams = {
  service: ServiceClient;
  provider: AiProvider;
  sourceId: string;
  fetchImpl?: FetchImpl;
  /** Resolves hostnames for the private-network check; tests pass one for their fake hosts. */
  lookup?: HostLookup;
  /** Upper bound on pages per run. The plan's remaining pages can lower it, never raise it. */
  pageLimit?: number;
  /** How long the run may take; tests shorten it. */
  timeBudgetMs?: number;
};

export type IngestResult =
  | {
      status: 'ready';
      pages: number;
      documents: number;
      chunks: number;
      unchanged: number;
      note: string | null;
    }
  | { status: 'failed'; error: string }
  | { status: 'skipped'; reason: string };

export const MAX_PAGES_PER_RUN = 300;
export const EMBED_BATCH_SIZE = 32;
/** Ids per request: the local gateway answers 414 once a filter carries a few hundred. */
export const ID_BATCH_SIZE = 100;
// Defined beside the upload rules so the delete actions can name the bucket without loading the pipeline.
export { STORAGE_BUCKET };
export const PAGE_LIMIT_MESSAGE =
  "Your plan's page limit is reached. Upgrade on the Billing page or remove a source.";
/** A run that has not touched its row for this long is treated as dead and may be started over. */
export const STALE_RUN_MS = 10 * 60_000;
/**
 * How long one run may take from its start. It runs in the route's after(), inside a maxDuration
 * of 300 s; the rest is left for saving the page in hand and writing the outcome. A wait for a
 * per-minute quota must end before it, and no page is started after it.
 */
export const INGEST_TIME_BUDGET_MS = 270_000;

/** Why a run ended before its last page, with what it saved kept. */
type EarlyStop = 'time' | 'busy';

type SourceUpdate = Database['public']['Tables']['sources']['Update'];

type Page = { url: string | null; title: string | null; markdown: string };

type Discovery = {
  pages: Page[];
  /** One sentence per page that could not be read. */
  problems: string[];
  /** True when more pages were found than the run was allowed to index. */
  truncated: boolean;
};

export const inBatches = <T>(items: T[], size = ID_BATCH_SIZE): T[][] => {
  const batches: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }

  return batches;
};

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

const readStorageObject = async (service: ServiceClient, path: string) => {
  const { data, error } = await service.storage.from(STORAGE_BUCKET).download(path);

  if (error || !data) {
    throw new IngestError(
      'The uploaded file could not be read from storage. Delete this source and upload it again.',
    );
  }

  return new Uint8Array(await data.arrayBuffer());
};

const removeDocuments = async (service: ServiceClient, ids: string[], failure: string) => {
  for (const batch of inBatches(ids)) {
    const { error } = await service.from('documents').delete().in('id', batch);

    if (error) {
      throw new IngestError(failure);
    }
  }
};

/**
 * Pages the account may still add: the plan's allowance minus documents outside this source. A
 * first look that sizes the crawl; the limit itself is held by every insert, so two runs that start
 * together cannot both spend the same allowance.
 */
const remainingPages = async (service: ServiceClient, source: Pick<Source, 'id' | 'owner_id'>) => {
  const [{ data: subscription }, account, own] = await Promise.all([
    service
      .from('subscriptions')
      .select('plan_id, status')
      .eq('account_id', source.owner_id)
      .maybeSingle(),
    service
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', source.owner_id),
    service
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', source.id),
  ]);
  const planId = entitledPlanId(subscription);
  const used = Math.max((account.count ?? 0) - (own.count ?? 0), 0);

  return checkCapacity(planId, used, 'pages');
};

const discoverPages = async (
  service: ServiceClient,
  source: Source,
  pageLimit: number,
  fetchImpl: FetchImpl,
  lookup: HostLookup | undefined,
  onFound: (count: number) => void,
): Promise<Discovery> => {
  switch (source.kind) {
    case 'url':
    case 'sitemap': {
      const uri = source.uri ?? '';
      let seeds = [uri];
      let truncated = false;

      if (source.kind === 'sitemap') {
        // One more than the limit tells whether the sitemap goes on beyond what this run indexes.
        const listed = await discoverSitemapUrls({
          url: uri,
          fetchImpl,
          lookup,
          limit: pageLimit + 1,
        });

        if (listed.length === 0) {
          throw new IngestError(
            'The sitemap lists no pages. Check the address or add the site as a website instead.',
          );
        }

        truncated = listed.length > pageLimit;
        seeds = listed.slice(0, pageLimit);
      }

      let found = 0;
      const result = await crawlPages({
        seeds,
        scope: source.kind === 'url' ? crawlScope(uri) : null,
        pageLimit,
        fetchImpl,
        lookup,
        onPage: () => {
          found += 1;
          onFound(found);
        },
      });

      return {
        pages: result.pages.map((page) => ({
          url: page.url,
          title: page.title,
          markdown: page.markdown,
        })),
        problems: result.errors.map((error) => error.message),
        truncated: truncated || result.truncated,
      };
    }
    case 'upload': {
      const path = source.storage_path ?? '';
      const type = uploadTypeFor(path, source.mime_type);

      if (!type) {
        throw new IngestError(
          'This file type is not supported. Upload a PDF, Word, HTML, Markdown or text file.',
        );
      }

      const extracted = await extractUpload(await readStorageObject(service, path), type);

      onFound(1);

      return { pages: [{ url: null, ...extracted }], problems: [], truncated: false };
    }
    case 'text': {
      const extracted = extractText(await readStorageObject(service, source.storage_path ?? ''));

      onFound(1);

      return { pages: [{ url: null, ...extracted }], problems: [], truncated: false };
    }
  }
};

const noContentMessage = (source: Source, problems: string[]) => {
  if (source.kind === 'upload') {
    return 'The file has no readable text. A scanned PDF needs OCR before it can be indexed.';
  }

  if (source.kind === 'text') {
    return 'The pasted text is empty.';
  }

  return problems[0]
    ? `No pages could be read. ${problems[0]}`
    : 'No readable content was found on the pages.';
};

/** What a person should know about a run that finished: pages left out and why. */
export const describeRun = ({
  pages,
  truncated,
  problems,
  atPlanLimit,
  stoppedEarly = null,
  planned = pages,
}: {
  pages: number;
  truncated: boolean;
  problems: string[];
  atPlanLimit: boolean;
  /** The run ended before its last page; a re-index carries on from there. */
  stoppedEarly?: EarlyStop | null;
  /** The pages the run set out to index. */
  planned?: number;
}) => {
  const notes: string[] = [];
  const count = `${pages} ${pages === 1 ? 'page' : 'pages'}`;
  const progress = `${formatCount(pages)} of ${plural(planned, 'page')}`;

  if (stoppedEarly === 'busy') {
    notes.push(
      `The embedding model was busy, so this run stopped after ${progress}. Re-index in a few minutes to add the rest.`,
    );
  } else if (stoppedEarly === 'time') {
    notes.push(
      `This run stopped after ${progress}, as much as one run has time for. Re-index to add the rest.`,
    );
  } else if (truncated) {
    notes.push(
      atPlanLimit
        ? `Stopped at your plan's page limit after ${count}. Upgrade on the Billing page or remove a source to index the rest.`
        : `Stopped after ${count}, the most one run indexes. Re-index to continue with the rest.`,
    );
  }

  if (problems.length > 0) {
    const shown = problems.slice(0, 3).join(' ');
    const more = problems.length > 3 ? ` And ${problems.length - 3} more.` : '';

    notes.push(
      `${problems.length} ${problems.length === 1 ? 'page' : 'pages'} could not be read. ${shown}${more}`,
    );
  }

  return notes.length > 0 ? notes.join(' ').slice(0, 1000) : null;
};

const embedChunks = async (
  provider: AiProvider,
  chunks: Chunk[],
  title: string,
  deadline: number,
) => {
  const vectors: number[][] = [];

  for (let start = 0; start < chunks.length; start += EMBED_BATCH_SIZE) {
    const batch: EmbedInput[] = chunks.slice(start, start + EMBED_BATCH_SIZE).map((chunk) => ({
      text: chunk.heading ? `${chunk.heading}\n${chunk.content}` : chunk.content,
      title,
    }));
    const embedded = await provider.embed(batch, 'document', { deadline });

    if (embedded.length !== batch.length) {
      throw new IngestError(
        'The embedding provider returned the wrong number of vectors. Re-index to try again.',
      );
    }

    vectors.push(...embedded);
  }

  return vectors;
};

/** The title a page is stored under: the person's own title for pasted text, the page's otherwise. */
const documentTitle = (source: Source, page: Page) => {
  const title = source.kind === 'text' ? source.title : (page.title ?? source.title);

  return title.trim().slice(0, 200) || source.title;
};

/** A website named after its address takes the start page's title once that page has been read. */
const sourceTitleAfterCrawl = (source: Source, pages: Page[]) => {
  if (source.kind !== 'url' || !isAutoLabel(source.title, source.uri, 'url')) {
    return null;
  }

  const start = normalizeUrl(source.uri ?? '');
  const startPage = pages.find((page) => page.url === start) ?? pages[0];
  const title = startPage?.title?.trim().slice(0, 200);

  return title ? title : null;
};

/**
 * Indexes one source end to end: discovers its pages, turns them into Markdown, chunks and embeds
 * them and writes documents and chunks. Progress and the outcome land on the source row, so the
 * Knowledge screen can follow along. Never throws; failures are reported on the row and returned.
 */
export const ingestSource = async (params: IngestParams): Promise<IngestResult> => {
  const { service, provider, sourceId, fetchImpl = fetch, lookup } = params;
  const deadline = Date.now() + (params.timeBudgetMs ?? INGEST_TIME_BUDGET_MS);
  const progress = createProgress(service, sourceId);

  const update = async (fields: SourceUpdate) => {
    await progress.flush();

    const { error } = await service.from('sources').update(fields).eq('id', sourceId);

    if (error) {
      throw new IngestError('The source row could not be updated. Re-index to try again.');
    }
  };

  const { data: source, error: loadError } = await service
    .from('sources')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();

  if (loadError) {
    return { status: 'failed', error: 'The source could not be loaded. Re-index to try again.' };
  }

  if (!source) {
    return { status: 'failed', error: 'That source does not exist.' };
  }

  // Only one run per source: the row is claimed with a conditional update, so a second run that
  // was scheduled by mistake (two tabs, a retried request) finds it taken and steps aside.
  const staleBefore = new Date(Date.now() - STALE_RUN_MS).toISOString();
  const { data: claimed } = await service
    .from('sources')
    .update({ status: 'crawling', error: null, pages_found: 0, pages_done: 0 })
    .eq('id', sourceId)
    .or(`status.in.(queued,ready,failed),updated_at.lt.${staleBefore}`)
    .select('id');

  if (!claimed || claimed.length === 0) {
    return { status: 'skipped', reason: 'This source is being indexed by another run.' };
  }

  try {
    const capacity = await remainingPages(service, source);

    if (capacity.remaining <= 0) {
      throw new IngestError(PAGE_LIMIT_MESSAGE);
    }

    const pageLimit = Math.max(
      1,
      Math.min(capacity.remaining, params.pageLimit ?? MAX_PAGES_PER_RUN, MAX_PAGES_PER_RUN),
    );
    const atPlanLimit = pageLimit === capacity.remaining && capacity.remaining < MAX_PAGES_PER_RUN;

    const { pages, problems, truncated } = await discoverPages(
      service,
      source,
      pageLimit,
      fetchImpl,
      lookup,
      (count) => progress.set({ pages_found: count }),
    );

    const readable = pages.filter((page) => page.markdown.trim().length > 0);

    if (readable.length === 0) {
      throw new IngestError(noContentMessage(source, problems));
    }

    await update({ status: 'indexing', pages_found: readable.length, pages_done: 0 });

    const { data: existing, error: existingError } = await service
      .from('documents')
      .select('id, url, checksum')
      .eq('source_id', sourceId);

    if (existingError) {
      throw new IngestError(
        'The pages indexed earlier could not be loaded. Re-index to try again.',
      );
    }

    const keyOf = (url: string | null) => url ?? '';
    const previousByKey = new Map(
      (existing ?? []).map((document) => [keyOf(document.url), document]),
    );
    const planned = new Set(readable.map((page) => keyOf(page.url)));

    // Pages that vanished go first: they should not count against the plan while the rest is written.
    await removeDocuments(
      service,
      (existing ?? [])
        .filter((document) => !planned.has(keyOf(document.url)))
        .map((document) => document.id),
      'Pages that no longer exist could not be removed. Re-index to try again.',
    );

    const seen = new Set<string>();
    let done = 0;
    let unchanged = 0;
    let stoppedAtLimit = false;
    let stoppedEarly: EarlyStop | null = null;

    for (const page of readable) {
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

      const title = documentTitle(source, page);
      const chunks = chunkMarkdown(page.markdown);

      if (chunks.length === 0) {
        // Nothing left to index on this page; an earlier copy would answer with text that is gone.
        await removeDocuments(
          service,
          previous ? [previous.id] : [],
          'An earlier copy of a page could not be removed. Re-index to try again.',
        );
        continue;
      }

      // Past the budget no page is started: what is saved stays, and a re-index skips it.
      if (Date.now() >= deadline) {
        stoppedEarly = 'time';
        break;
      }

      let vectors: number[][];

      try {
        vectors = await embedChunks(provider, chunks, title, deadline);
      } catch (cause) {
        // A per-minute quota that outlasts the run ends it early rather than failing it, once
        // there is something to keep. The day's cap is not this: it fails below and says when.
        if (cause instanceof ModelBusyError && done > 0) {
          stoppedEarly = 'busy';
          break;
        }

        throw cause;
      }

      // The insert checks the account's page count in the same transaction, so runs that overlap
      // share one allowance. A null id means the limit is reached; the earlier copy, if any, stays.
      const { data: documentId, error: documentError } = await service.rpc(
        'insert_document_within_limit',
        {
          page_limit: capacity.limit,
          assistant: source.assistant_id,
          owner: source.owner_id,
          source: source.id,
          page_url: page.url ?? undefined,
          page_title: title,
          page_content: page.markdown,
          page_checksum: checksum,
          page_token_count: estimateTokens(page.markdown),
          replaces: previous?.id,
        },
      );

      if (documentError) {
        throw new IngestError('A page could not be saved. Re-index to try again.');
      }

      if (!documentId) {
        stoppedAtLimit = true;
        break;
      }

      const rows = chunks.map((chunk, position) => ({
        assistant_id: source.assistant_id,
        owner_id: source.owner_id,
        document_id: documentId,
        position,
        heading: chunk.heading,
        content: chunk.content,
        token_count: chunk.tokenCount,
        embedding: JSON.stringify(vectors[position]),
      }));

      for (const batch of inBatches(rows, EMBED_BATCH_SIZE)) {
        const { error } = await service.from('chunks').insert(batch);

        if (error) {
          // A document without its chunks would be invisible to retrieval; leave nothing behind.
          await service.from('documents').delete().eq('id', documentId);
          throw new IngestError(
            'The passages of a page could not be saved. Re-index to try again.',
          );
        }
      }

      done += 1;
      progress.set({ pages_done: done });
    }

    // One request for the whole source, however many pages it has: no id list in the URL.
    const { data: counted, error: countError } = await service
      .from('documents')
      .select('id, chunks(count)')
      .eq('source_id', sourceId);

    if (countError) {
      throw new IngestError('The passages could not be counted. Re-index to try again.');
    }

    const documents = counted ?? [];

    // Another run spent the allowance before this one wrote a page: the same outcome as a full plan
    // at the start, not an empty source marked ready.
    if (stoppedAtLimit && documents.length === 0) {
      throw new IngestError(PAGE_LIMIT_MESSAGE);
    }

    // Stopped before a single page was saved: nothing to show as ready.
    if (stoppedEarly && documents.length === 0) {
      throw stoppedEarly === 'busy' ? new ModelBusyError([]) : new IngestError(TIMED_OUT_FAILURE);
    }

    const chunkCount = documents.reduce(
      (sum, document) => sum + (document.chunks[0]?.count ?? 0),
      0,
    );
    const indexed = stoppedAtLimit || stoppedEarly ? done : readable.length;
    const note = describeRun({
      pages: indexed,
      truncated: truncated || stoppedAtLimit,
      problems,
      atPlanLimit: atPlanLimit || stoppedAtLimit,
      stoppedEarly,
      planned: readable.length,
    });
    const title = sourceTitleAfterCrawl(source, readable);

    await update({
      status: 'ready',
      error: note,
      pages_found: readable.length,
      pages_done: done,
      chunk_count: chunkCount,
      last_indexed_at: new Date().toISOString(),
      ...(title ? { title } : {}),
    });

    return {
      status: 'ready',
      pages: indexed,
      documents: documents.length,
      chunks: chunkCount,
      unchanged,
      note,
    };
  } catch (cause) {
    const error = humanizeIngestError(cause);

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
export { humanizeIngestError, IngestError } from './errors';
export { checksumOf, extractText, extractUpload } from './extract';
export {
  assertPublicUrl,
  type HostLookup,
  isBlockedAddress,
  isBlockedHostname,
  publicLookup,
} from './guard';
export { htmlToMarkdown } from './html';
export { type FetchImpl, FetchPageError } from './http';
export { isAutoLabel, labelForUrl } from './label';
export { discoverSitemapUrls, parseSitemap } from './sitemap';
