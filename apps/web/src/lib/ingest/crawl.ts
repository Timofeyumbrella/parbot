import { defaultLookup, type HostLookup, memoizeLookup } from './guard';
import { type FetchImpl, FetchPageError, fetchHtml } from './http';
import { htmlToMarkdown } from './html';

export type CrawlScope = { origin: string; pathPrefix: string };

export type CrawledPage = { url: string; title: string | null; markdown: string };

export type CrawlOptions = {
  /** Pages to start from. A website crawl has one; a sitemap crawl has them all. */
  seeds: string[];
  /** Links are followed only inside this scope; null follows none. */
  scope: CrawlScope | null;
  pageLimit: number;
  fetchImpl?: FetchImpl;
  /** Resolves hostnames for the private-network check; tests pass one for their fake hosts. */
  lookup?: HostLookup;
  concurrency?: number;
  maxDepth?: number;
  onPage?: (page: CrawledPage) => void | Promise<void>;
};

export type CrawlResult = {
  pages: CrawledPage[];
  errors: FetchPageError[];
  /** True when the page limit stopped the crawl with pages still queued. */
  truncated: boolean;
};

export const CRAWL_CONCURRENCY = 4;
export const CRAWL_MAX_DEPTH = 3;

/** File types that are never HTML pages, checked before a request is spent on them. */
export const SKIPPED_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'avif',
  'ico',
  'bmp',
  'tif',
  'tiff',
  'css',
  'js',
  'mjs',
  'cjs',
  'map',
  'json',
  'xml',
  'rss',
  'atom',
  'txt',
  'md',
  'csv',
  'yaml',
  'yml',
  'zip',
  'gz',
  'tgz',
  'tar',
  'bz2',
  '7z',
  'rar',
  'dmg',
  'exe',
  'msi',
  'apk',
  'deb',
  'rpm',
  'mp3',
  'mp4',
  'm4a',
  'wav',
  'ogg',
  'webm',
  'mov',
  'avi',
  'mkv',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'epub',
  'wasm',
  'jar',
  'war',
]);

/** The origin and directory a website crawl stays inside: /guide/intro crawls under /guide/. */
export const crawlScope = (startUrl: string): CrawlScope => {
  const url = new URL(startUrl);
  const path = url.pathname;
  const directory = path.endsWith('/') ? path : path.slice(0, path.lastIndexOf('/') + 1);

  return { origin: url.origin, pathPrefix: directory || '/' };
};

/** Resolves a link and strips the parts that never change the page: fragment, query, credentials. */
export const normalizeUrl = (href: string, base?: string): string | null => {
  try {
    const url = new URL(href.trim(), base);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    url.hash = '';
    url.search = '';
    url.username = '';
    url.password = '';

    return url.href;
  } catch {
    return null;
  }
};

export const hasSkippedExtension = (url: URL) => {
  const last = url.pathname.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');

  if (dot <= 0) {
    return false;
  }

  return SKIPPED_EXTENSIONS.has(last.slice(dot + 1).toLowerCase());
};

export const isInScope = (href: string, scope: CrawlScope) => {
  let url: URL;

  try {
    url = new URL(href);
  } catch {
    return false;
  }

  return (
    url.origin === scope.origin &&
    url.pathname.startsWith(scope.pathPrefix) &&
    !hasSkippedExtension(url)
  );
};

/** The links on a page worth following: resolved, normalised, in scope, each once. */
export const crawlableLinks = (hrefs: string[], base: string, scope: CrawlScope): string[] => {
  const seen = new Set<string>();

  for (const href of hrefs) {
    if (href.trim().startsWith('#')) {
      // An anchor points into the page it is on; that page is already being read.
      continue;
    }

    const url = normalizeUrl(href, base);

    if (url && isInScope(url, scope)) {
      seen.add(url);
    }
  }

  return [...seen];
};

/**
 * Breadth-first crawl with a small worker pool. Pages are handed to `onPage` as they arrive so
 * progress can be shown; the result carries them all in discovery order.
 */
export const crawlPages = async (options: CrawlOptions): Promise<CrawlResult> => {
  const {
    seeds,
    scope,
    pageLimit,
    fetchImpl = fetch,
    concurrency = CRAWL_CONCURRENCY,
    maxDepth = CRAWL_MAX_DEPTH,
    onPage,
  } = options;
  const lookup = memoizeLookup(options.lookup ?? defaultLookup);
  const pages: CrawledPage[] = [];
  const errors: FetchPageError[] = [];
  const seen = new Set<string>();
  const queue: { url: string; depth: number }[] = [];

  for (const seed of seeds) {
    const url = normalizeUrl(seed);

    if (url && !seen.has(url) && (!scope || isInScope(url, scope) || seed === seeds[0])) {
      seen.add(url);
      queue.push({ url, depth: 0 });
    }
  }

  if (pageLimit <= 0 || queue.length === 0) {
    return { pages, errors, truncated: queue.length > 0 };
  }

  const visit = async ({ url, depth }: { url: string; depth: number }) => {
    let fetched;

    try {
      fetched = await fetchHtml(url, { fetchImpl, lookup });
    } catch (cause) {
      if (cause instanceof FetchPageError) {
        errors.push(cause);

        return;
      }

      throw cause;
    }

    const finalUrl = normalizeUrl(fetched.finalUrl) ?? url;

    if (finalUrl !== url) {
      if (seen.has(finalUrl) || (scope && !isInScope(finalUrl, scope))) {
        // A redirect onto a page already crawled, or out of scope, adds nothing.
        return;
      }

      seen.add(finalUrl);
    }

    const extracted = htmlToMarkdown(fetched.html, { baseUrl: finalUrl });

    if (scope && depth < maxDepth) {
      for (const link of crawlableLinks(extracted.links, finalUrl, scope)) {
        if (!seen.has(link)) {
          seen.add(link);
          queue.push({ url: link, depth: depth + 1 });
        }
      }
    }

    if (!extracted.markdown) {
      return;
    }

    if (pages.length >= pageLimit) {
      return;
    }

    const page = { url: finalUrl, title: extracted.title, markdown: extracted.markdown };

    pages.push(page);
    await onPage?.(page);
  };

  await new Promise<void>((resolve, reject) => {
    let active = 0;
    let failed = false;

    const pump = () => {
      if (failed) {
        return;
      }

      while (active < concurrency && queue.length > 0 && pages.length + active < pageLimit) {
        const next = queue.shift()!;

        active += 1;
        visit(next)
          .catch((cause: unknown) => {
            failed = true;
            reject(cause);
          })
          .finally(() => {
            active -= 1;
            pump();
          });
      }

      if (active === 0) {
        resolve();
      }
    };

    pump();
  });

  return { pages, errors, truncated: queue.length > 0 && pages.length >= pageLimit };
};
