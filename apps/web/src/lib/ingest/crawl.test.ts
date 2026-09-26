// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { crawlableLinks, crawlPages, crawlScope, isInScope, normalizeUrl } from './crawl';
import { publicLookup } from './guard';
import type { FetchImpl } from './http';

const scope = crawlScope('https://docs.example.com/guide/intro');

describe('crawlScope', () => {
  it('uses the directory of the start page', () => {
    expect(scope).toEqual({ origin: 'https://docs.example.com', pathPrefix: '/guide/' });
    expect(crawlScope('https://docs.example.com/guide/')).toEqual({
      origin: 'https://docs.example.com',
      pathPrefix: '/guide/',
    });
    expect(crawlScope('https://docs.example.com')).toEqual({
      origin: 'https://docs.example.com',
      pathPrefix: '/',
    });
  });
});

describe('normalizeUrl', () => {
  it('strips fragments, queries and credentials and resolves relative links', () => {
    expect(normalizeUrl('setup#install', 'https://docs.example.com/guide/intro')).toBe(
      'https://docs.example.com/guide/setup',
    );
    expect(normalizeUrl('https://docs.example.com/guide/setup?utm=1')).toBe(
      'https://docs.example.com/guide/setup',
    );
    expect(normalizeUrl('https://user:pw@docs.example.com/guide/')).toBe(
      'https://docs.example.com/guide/',
    );
  });

  it('rejects anything that is not http(s)', () => {
    expect(normalizeUrl('mailto:hi@example.com')).toBeNull();
    expect(normalizeUrl('tel:+123')).toBeNull();
    expect(normalizeUrl('javascript:void(0)')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
  });
});

describe('isInScope', () => {
  it('keeps same-origin links under the path prefix', () => {
    expect(isInScope('https://docs.example.com/guide/setup', scope)).toBe(true);
    expect(isInScope('https://docs.example.com/guide/deep/er/page', scope)).toBe(true);
  });

  it('rejects other origins, other paths and non-HTML files', () => {
    expect(isInScope('https://example.com/guide/setup', scope)).toBe(false);
    expect(isInScope('http://docs.example.com/guide/setup', scope)).toBe(false);
    expect(isInScope('https://docs.example.com/pricing', scope)).toBe(false);
    expect(isInScope('https://docs.example.com/guide/manual.pdf', scope)).toBe(false);
    expect(isInScope('https://docs.example.com/guide/logo.PNG', scope)).toBe(false);
    expect(isInScope('https://docs.example.com/guide/page.html', scope)).toBe(true);
  });
});

describe('crawlableLinks', () => {
  it('resolves, filters and de-duplicates the links on a page', () => {
    const links = crawlableLinks(
      [
        'setup',
        './setup#top',
        'setup?v=2',
        '/guide/faq',
        '/pricing',
        'https://other.com/guide/x',
        'mailto:a@b.c',
        'assets/a.css',
        '#',
      ],
      'https://docs.example.com/guide/intro',
      scope,
    );

    expect(links).toEqual([
      'https://docs.example.com/guide/setup',
      'https://docs.example.com/guide/faq',
    ]);
  });
});

const page = (title: string, body: string) =>
  new Response(
    `<html><head><title>${title}</title></head><body><main>${body}</main></body></html>`,
    {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    },
  );

const SITE: Record<string, () => Response> = {
  'https://docs.example.com/guide/intro': () =>
    page(
      'Intro',
      '<h1>Intro</h1><p>Welcome to the guide.</p><a href="setup">Setup</a> <a href="/guide/faq?ref=nav">FAQ</a> <a href="/pricing">Pricing</a> <a href="/guide/manual.pdf">PDF</a> <a href="#top">Top</a>',
    ),
  'https://docs.example.com/guide/setup': () =>
    page(
      'Setup',
      '<h1>Setup</h1><p>Install the package.</p><a href="advanced/tuning">Tuning</a> <a href="intro">Back</a>',
    ),
  'https://docs.example.com/guide/faq': () =>
    page('FAQ', '<h1>FAQ</h1><p>Questions people ask.</p>'),
  'https://docs.example.com/guide/advanced/tuning': () =>
    page('Tuning', '<h1>Tuning</h1><p>Turn the knobs.</p><a href="deeper">Deeper</a>'),
  'https://docs.example.com/guide/advanced/deeper': () =>
    page('Deeper', '<h1>Deeper</h1><p>Four levels down.</p><a href="deepest">Deepest</a>'),
  'https://docs.example.com/guide/advanced/deepest': () =>
    page('Deepest', '<h1>Deepest</h1><p>Never reached.</p>'),
  'https://docs.example.com/pricing': () => page('Pricing', '<h1>Pricing</h1><p>Out of scope.</p>'),
  'https://docs.example.com/guide/image': () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }),
};

const makeFetch =
  (log: string[] = []): FetchImpl =>
  async (input, init) => {
    const url = String(input);

    log.push(url);
    expect(new Headers(init?.headers).get('user-agent')).toBe(
      'ParbotBot/0.1 (+https://parbot-web.vercel.app)',
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    return SITE[url]?.() ?? new Response('missing', { status: 404 });
  };

describe('crawlPages', () => {
  it('walks same-origin links under the start path breadth first, three levels deep', async () => {
    const log: string[] = [];
    const result = await crawlPages({
      seeds: ['https://docs.example.com/guide/intro'],
      scope,
      pageLimit: 50,
      fetchImpl: makeFetch(log),
      lookup: publicLookup,
      concurrency: 1,
    });

    expect(result.pages.map((entry) => entry.url)).toEqual([
      'https://docs.example.com/guide/intro',
      'https://docs.example.com/guide/setup',
      'https://docs.example.com/guide/faq',
      'https://docs.example.com/guide/advanced/tuning',
      'https://docs.example.com/guide/advanced/deeper',
    ]);
    expect(log).not.toContain('https://docs.example.com/pricing');
    expect(log).not.toContain('https://docs.example.com/guide/manual.pdf');
    expect(log).not.toContain('https://docs.example.com/guide/advanced/deepest');
    expect(result.pages[0]).toMatchObject({
      title: 'Intro',
      markdown: expect.stringContaining('Welcome to the guide.'),
    });
    expect(result.truncated).toBe(false);
  });

  it('stops at the page limit and says so', async () => {
    const result = await crawlPages({
      seeds: ['https://docs.example.com/guide/intro'],
      scope,
      pageLimit: 2,
      fetchImpl: makeFetch(),
      lookup: publicLookup,
    });

    expect(result.pages).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('reports pages that are missing or not HTML instead of failing the crawl', async () => {
    const result = await crawlPages({
      seeds: [
        'https://docs.example.com/guide/image',
        'https://docs.example.com/guide/missing',
        'https://docs.example.com/guide/faq',
      ],
      scope: null,
      pageLimit: 10,
      fetchImpl: makeFetch(),
      lookup: publicLookup,
    });

    expect(result.pages.map((entry) => entry.url)).toEqual(['https://docs.example.com/guide/faq']);
    expect(result.errors.map((error) => error.reason).sort()).toEqual([
      'HTTP 404',
      'not an HTML page (image/png)',
    ]);
  });

  it('follows no links when there is no scope, as a sitemap crawl wants', async () => {
    const log: string[] = [];
    const result = await crawlPages({
      seeds: ['https://docs.example.com/guide/intro'],
      scope: null,
      pageLimit: 10,
      fetchImpl: makeFetch(log),
      lookup: publicLookup,
    });

    expect(result.pages).toHaveLength(1);
    expect(log).toEqual(['https://docs.example.com/guide/intro']);
  });

  it('hands each page to onPage as it arrives', async () => {
    const seen: string[] = [];

    await crawlPages({
      seeds: ['https://docs.example.com/guide/faq'],
      scope,
      pageLimit: 10,
      fetchImpl: makeFetch(),
      lookup: publicLookup,
      onPage: (entry) => {
        seen.push(entry.title ?? '');
      },
    });

    expect(seen).toEqual(['FAQ']);
  });
});
