import { assertPublicUrl, BlockedHostError, defaultLookup, type HostLookup } from './guard';

export const USER_AGENT = 'ParbotBot/0.1 (+https://parbot.dev)';
export const FETCH_TIMEOUT_MS = 10_000;
/** Larger responses are almost never documentation pages; reading them would only cost memory. */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
/** Redirect chains longer than this are loops or link shorteners gone wrong. */
export const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type FetchImpl = typeof fetch;

export type FetchOptions = {
  fetchImpl?: FetchImpl;
  /** The Accept header; pages want HTML, sitemaps want XML. */
  accept?: string;
  /** Resolves hostnames for the private-network check. */
  lookup?: HostLookup;
};

export class FetchPageError extends Error {
  readonly url: string;
  readonly reason: string;

  constructor(url: string, reason: string) {
    super(`Could not fetch ${url}: ${reason}.`);
    this.name = 'FetchPageError';
    this.url = url;
    this.reason = reason;
  }
}

export type FetchedResource = {
  url: string;
  /** Where the response came from after redirects. */
  finalUrl: string;
  contentType: string;
  bytes: Uint8Array;
};

export type FetchedPage = { url: string; finalUrl: string; html: string };

const HTML_TYPES = ['text/html', 'application/xhtml+xml'];
const HTML_ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1';

export const isHtmlContentType = (contentType: string) => {
  const type = contentType.split(';')[0]!.trim().toLowerCase();

  return type === '' || HTML_TYPES.includes(type);
};

const describeFailure = (cause: unknown) => {
  if (cause instanceof Error) {
    if (cause.name === 'TimeoutError' || cause.name === 'AbortError') {
      return `timed out after ${FETCH_TIMEOUT_MS / 1000} seconds`;
    }

    const detail = (cause.cause instanceof Error ? cause.cause.message : cause.message).trim();

    return detail ? `network error (${detail})` : 'network error';
  }

  return 'network error';
};

const assertAllowed = async (url: string, requested: string, lookup: HostLookup) => {
  try {
    await assertPublicUrl(requested, lookup);
  } catch (cause) {
    const reason = cause instanceof BlockedHostError ? cause.message : 'the address is not valid';

    throw new FetchPageError(
      url,
      requested === url ? reason : `it redirects to ${requested}, and ${reason}`,
    );
  }
};

/**
 * Fetches one URL with the crawler's identity and limits. Redirects are followed by hand so each
 * hop goes through the same private-network check as the address the user typed.
 */
export const fetchResource = async (
  url: string,
  options: FetchOptions = {},
): Promise<FetchedResource> => {
  const { fetchImpl = fetch, accept = HTML_ACCEPT, lookup = defaultLookup } = options;
  let current = url;
  let response: Response;

  for (let hop = 0; ; hop += 1) {
    await assertAllowed(url, current, lookup);

    try {
      response = await fetchImpl(current, {
        headers: { 'user-agent': USER_AGENT, accept },
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (cause) {
      throw new FetchPageError(url, describeFailure(cause));
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      break;
    }

    const location = response.headers.get('location');
    let next: string | null = null;

    try {
      next = location ? new URL(location, current).href : null;
    } catch {
      next = null;
    }

    if (!next) {
      throw new FetchPageError(url, `HTTP ${response.status} without a usable location`);
    }

    if (hop >= MAX_REDIRECTS) {
      throw new FetchPageError(url, `more than ${MAX_REDIRECTS} redirects`);
    }

    current = next;
  }

  if (!response.ok) {
    throw new FetchPageError(url, `HTTP ${response.status}`);
  }

  const declared = Number(response.headers.get('content-length') ?? 0);

  if (declared > MAX_RESPONSE_BYTES) {
    throw new FetchPageError(url, 'the response is larger than 5 MB');
  }

  let bytes: Uint8Array;

  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (cause) {
    throw new FetchPageError(url, describeFailure(cause));
  }

  if (bytes.byteLength > MAX_RESPONSE_BYTES) {
    throw new FetchPageError(url, 'the response is larger than 5 MB');
  }

  return {
    url,
    finalUrl: current,
    contentType: response.headers.get('content-type') ?? '',
    bytes,
  };
};

/** Fetches one page and insists on HTML; anything else is reported, never parsed. */
export const fetchHtml = async (url: string, options: FetchOptions = {}): Promise<FetchedPage> => {
  const resource = await fetchResource(url, { ...options, accept: HTML_ACCEPT });

  if (!isHtmlContentType(resource.contentType)) {
    const type = resource.contentType.split(';')[0]!.trim() || 'unknown type';

    throw new FetchPageError(url, `not an HTML page (${type})`);
  }

  return { url, finalUrl: resource.finalUrl, html: new TextDecoder().decode(resource.bytes) };
};
