import { gunzipSync } from 'node:zlib';

import { defaultLookup, type HostLookup, memoizeLookup } from './guard';
import { type FetchImpl, FetchPageError, fetchResource } from './http';

export type ParsedSitemap = { kind: 'index' | 'urlset'; locs: string[] };

/** Child sitemaps followed from a sitemap index. Beyond this the page limit has long been hit. */
export const MAX_CHILD_SITEMAPS = 50;

const decodeXml = (text: string) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

/** Pulls every <loc> out of a sitemap or sitemap index. Regex is enough: the format is flat. */
export const parseSitemap = (xml: string): ParsedSitemap => {
  const kind = /<sitemapindex[\s>]/i.test(xml) ? 'index' : 'urlset';
  const locs = new Set<string>();

  for (const match of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
    const raw = match[1]!.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
    const value = decodeXml(raw);

    if (isHttpUrl(value)) {
      locs.add(value);
    }
  }

  return { kind, locs: [...locs] };
};

const isGzip = (bytes: Uint8Array, url: string) =>
  (bytes[0] === 0x1f && bytes[1] === 0x8b) || /\.gz(\?|$)/i.test(url);

const fetchSitemapXml = async (url: string, fetchImpl: FetchImpl, lookup: HostLookup) => {
  const resource = await fetchResource(url, { fetchImpl, lookup, accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5' });
  const bytes = isGzip(resource.bytes, url) ? gunzipSync(resource.bytes) : resource.bytes;

  return new TextDecoder().decode(bytes);
};

/**
 * The page URLs a sitemap points at, in order, up to `limit`. A sitemap index is followed one
 * level down; child sitemaps that fail are skipped so one bad file does not sink the source.
 */
export const discoverSitemapUrls = async ({
  url,
  fetchImpl = fetch,
  lookup: lookupImpl = defaultLookup,
  limit,
}: {
  url: string;
  fetchImpl?: FetchImpl;
  lookup?: HostLookup;
  limit: number;
}): Promise<string[]> => {
  const lookup = memoizeLookup(lookupImpl);
  const root = parseSitemap(await fetchSitemapXml(url, fetchImpl, lookup));

  if (root.kind === 'urlset') {
    return root.locs.slice(0, limit);
  }

  const urls = new Set<string>();

  for (const child of root.locs.slice(0, MAX_CHILD_SITEMAPS)) {
    if (urls.size >= limit) {
      break;
    }

    try {
      const parsed = parseSitemap(await fetchSitemapXml(child, fetchImpl, lookup));

      if (parsed.kind === 'urlset') {
        for (const loc of parsed.locs) {
          urls.add(loc);
        }
      }
    } catch (cause) {
      if (!(cause instanceof FetchPageError)) {
        throw cause;
      }
    }
  }

  return [...urls].slice(0, limit);
};
