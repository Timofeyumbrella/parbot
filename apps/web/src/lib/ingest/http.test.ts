// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { publicLookup } from './guard';
import { type FetchImpl, fetchHtml, fetchResource, isHtmlContentType, MAX_REDIRECTS } from './http';

const page = (body: string) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

const serve =
  (
    site: Record<string, () => Response>,
    log: { url: string; redirect?: RequestRedirect }[] = [],
  ): FetchImpl =>
  async (input, init) => {
    log.push({ url: String(input), redirect: init?.redirect });

    return site[String(input)]?.() ?? new Response('missing', { status: 404 });
  };

describe('fetchResource', () => {
  it('follows redirects by hand, checking every hop, and reports where it ended up', async () => {
    const log: { url: string; redirect?: RequestRedirect }[] = [];
    const fetchImpl = serve(
      {
        'https://docs.example.com/old': () => redirect('/moved', 301),
        'https://docs.example.com/moved': () => redirect('https://docs.example.com/guide/'),
        'https://docs.example.com/guide/': () => page('<p>Here</p>'),
      },
      log,
    );

    const result = await fetchResource('https://docs.example.com/old', {
      fetchImpl,
      lookup: publicLookup,
    });

    expect(result.finalUrl).toBe('https://docs.example.com/guide/');
    expect(new TextDecoder().decode(result.bytes)).toBe('<p>Here</p>');
    expect(log.map((entry) => entry.url)).toEqual([
      'https://docs.example.com/old',
      'https://docs.example.com/moved',
      'https://docs.example.com/guide/',
    ]);
    expect(log.every((entry) => entry.redirect === 'manual')).toBe(true);
  });

  it('refuses a redirect into a private network and names it', async () => {
    const fetchImpl = serve({
      'https://docs.example.com/login': () => redirect('http://169.254.169.254/latest/meta-data/'),
      'https://docs.example.com/home': () => redirect('http://localhost:3000/'),
    });

    await expect(
      fetchResource('https://docs.example.com/login', { fetchImpl, lookup: publicLookup }),
    ).rejects.toThrow(
      'Could not fetch https://docs.example.com/login: it redirects to http://169.254.169.254/latest/meta-data/, and the address points at a private or internal network.',
    );
    await expect(
      fetchResource('https://docs.example.com/home', { fetchImpl, lookup: publicLookup }),
    ).rejects.toThrow('it redirects to http://localhost:3000/');
  });

  it('refuses a redirect to a name that resolves privately', async () => {
    const fetchImpl = serve({
      'https://docs.example.com/': () => redirect('https://intranet.example.com/'),
    });
    const lookup = async (name: string) =>
      name === 'intranet.example.com' ? ['10.1.2.3'] : ['93.184.216.34'];

    await expect(fetchResource('https://docs.example.com/', { fetchImpl, lookup })).rejects.toThrow(
      'private or internal network',
    );
  });

  it('refuses the start address itself when it is private', async () => {
    const fetchImpl = serve({});

    await expect(
      fetchResource('http://127.0.0.1:8080/', { fetchImpl, lookup: publicLookup }),
    ).rejects.toThrow(
      'Could not fetch http://127.0.0.1:8080/: the address points at a private or internal network.',
    );
    await expect(
      fetchResource('http://10.0.0.9/docs', { fetchImpl, lookup: publicLookup }),
    ).rejects.toThrow('private or internal network');
  });

  it('gives up on redirect loops and redirects without a location', async () => {
    const loop = serve({ 'https://docs.example.com/a': () => redirect('/a') });
    const blank = serve({
      'https://docs.example.com/b': () => new Response(null, { status: 302 }),
    });

    await expect(
      fetchResource('https://docs.example.com/a', { fetchImpl: loop, lookup: publicLookup }),
    ).rejects.toThrow(`more than ${MAX_REDIRECTS} redirects`);
    await expect(
      fetchResource('https://docs.example.com/b', { fetchImpl: blank, lookup: publicLookup }),
    ).rejects.toThrow('HTTP 302 without a usable location');
  });

  it('reports HTTP failures and oversized responses', async () => {
    const fetchImpl = serve({
      'https://docs.example.com/big': () =>
        new Response('x', {
          status: 200,
          headers: { 'content-type': 'text/html', 'content-length': String(6 * 1024 * 1024) },
        }),
    });

    await expect(
      fetchResource('https://docs.example.com/missing', { fetchImpl, lookup: publicLookup }),
    ).rejects.toThrow('HTTP 404');
    await expect(
      fetchResource('https://docs.example.com/big', { fetchImpl, lookup: publicLookup }),
    ).rejects.toThrow('larger than 5 MB');
  });

  it('sends the crawler identity and a timeout on every request', async () => {
    const fetchImpl: FetchImpl = async (_input, init) => {
      expect(new Headers(init?.headers).get('user-agent')).toBe(
        'ParbotBot/0.1 (+https://parbot.dev)',
      );
      expect(new Headers(init?.headers).get('accept')).toContain('text/html');
      expect(init?.signal).toBeInstanceOf(AbortSignal);

      return page('<p>ok</p>');
    };

    await expect(
      fetchHtml('https://docs.example.com/', { fetchImpl, lookup: publicLookup }),
    ).resolves.toMatchObject({ html: '<p>ok</p>' });
  });
});

describe('fetchHtml', () => {
  it('insists on an HTML content type', async () => {
    const fetchImpl = serve({
      'https://docs.example.com/data.json': () => Response.json({ a: 1 }),
    });

    await expect(
      fetchHtml('https://docs.example.com/data.json', { fetchImpl, lookup: publicLookup }),
    ).rejects.toThrow('not an HTML page (application/json)');
  });
});

describe('isHtmlContentType', () => {
  it('accepts html and xhtml with parameters, and a missing type', () => {
    expect(isHtmlContentType('text/html; charset=utf-8')).toBe(true);
    expect(isHtmlContentType('application/xhtml+xml')).toBe(true);
    expect(isHtmlContentType('')).toBe(true);
    expect(isHtmlContentType('application/pdf')).toBe(false);
  });
});
