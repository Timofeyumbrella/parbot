// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { FetchImpl } from './http';
import { discoverSitemapUrls, parseSitemap } from './sitemap';

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://docs.example.com/guide/intro</loc><lastmod>2026-01-01</lastmod></url>
  <url><loc> https://docs.example.com/guide/setup?ref=x&amp;y=1 </loc></url>
  <url><loc><![CDATA[https://docs.example.com/guide/faq]]></loc></url>
  <url><loc>https://docs.example.com/guide/intro</loc></url>
  <url><loc>ftp://docs.example.com/not-http</loc></url>
</urlset>`;

const INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://docs.example.com/sitemap-guide.xml</loc></sitemap>
  <sitemap><loc>https://docs.example.com/sitemap-api.xml</loc></sitemap>
  <sitemap><loc>https://docs.example.com/sitemap-missing.xml</loc></sitemap>
</sitemapindex>`;

const API = `<urlset><url><loc>https://docs.example.com/api/a</loc></url><url><loc>https://docs.example.com/api/b</loc></url></urlset>`;

const xml = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'application/xml' } });

const fetchImpl: FetchImpl = async (input) => {
  const url = String(input);

  if (url.endsWith('/sitemap.xml')) {
    return xml(INDEX);
  }

  if (url.endsWith('/sitemap-guide.xml')) {
    return xml(URLSET);
  }

  if (url.endsWith('/sitemap-api.xml')) {
    return xml(API);
  }

  if (url.endsWith('/flat.xml')) {
    return xml(URLSET);
  }

  return new Response('not found', { status: 404 });
};

describe('parseSitemap', () => {
  it('reads every loc of a urlset, decoded, trimmed and de-duplicated', () => {
    expect(parseSitemap(URLSET)).toEqual({
      kind: 'urlset',
      locs: [
        'https://docs.example.com/guide/intro',
        'https://docs.example.com/guide/setup?ref=x&y=1',
        'https://docs.example.com/guide/faq',
      ],
    });
  });

  it('recognises a sitemap index', () => {
    expect(parseSitemap(INDEX)).toEqual({
      kind: 'index',
      locs: [
        'https://docs.example.com/sitemap-guide.xml',
        'https://docs.example.com/sitemap-api.xml',
        'https://docs.example.com/sitemap-missing.xml',
      ],
    });
  });
});

describe('discoverSitemapUrls', () => {
  it('returns the pages of a flat sitemap up to the limit', async () => {
    await expect(discoverSitemapUrls({ url: 'https://docs.example.com/flat.xml', fetchImpl, limit: 2 })).resolves.toEqual([
      'https://docs.example.com/guide/intro',
      'https://docs.example.com/guide/setup?ref=x&y=1',
    ]);
  });

  it('follows a sitemap index one level and skips children that fail', async () => {
    await expect(discoverSitemapUrls({ url: 'https://docs.example.com/sitemap.xml', fetchImpl, limit: 10 })).resolves.toEqual([
      'https://docs.example.com/guide/intro',
      'https://docs.example.com/guide/setup?ref=x&y=1',
      'https://docs.example.com/guide/faq',
      'https://docs.example.com/api/a',
      'https://docs.example.com/api/b',
    ]);
  });

  it('stops reading child sitemaps once the limit is reached', async () => {
    const seen: string[] = [];
    const counting: FetchImpl = (input, init) => {
      seen.push(String(input));

      return fetchImpl(input, init);
    };

    await expect(discoverSitemapUrls({ url: 'https://docs.example.com/sitemap.xml', fetchImpl: counting, limit: 3 })).resolves.toHaveLength(3);
    expect(seen).toEqual(['https://docs.example.com/sitemap.xml', 'https://docs.example.com/sitemap-guide.xml']);
  });

  it('reports a sitemap that cannot be fetched', async () => {
    await expect(discoverSitemapUrls({ url: 'https://docs.example.com/nope.xml', fetchImpl, limit: 5 })).rejects.toThrow('HTTP 404');
  });
});
