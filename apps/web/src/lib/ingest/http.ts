export const USER_AGENT = 'ParbotBot/0.1 (+https://parbot.dev)';
export const FETCH_TIMEOUT_MS = 10_000;
/** Larger responses are almost never documentation pages; reading them would only cost memory. */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export type FetchImpl = typeof fetch;

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

export const fetchResource = async (
  url: string,
  fetchImpl: FetchImpl = fetch,
  accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
): Promise<FetchedResource> => {
  let response: Response;

  try {
    response = await fetchImpl(url, {
      headers: { 'user-agent': USER_AGENT, accept },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new FetchPageError(url, describeFailure(cause));
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
    finalUrl: response.url || url,
    contentType: response.headers.get('content-type') ?? '',
    bytes,
  };
};

/** Fetches one page and insists on HTML; anything else is reported, never parsed. */
export const fetchHtml = async (url: string, fetchImpl: FetchImpl = fetch): Promise<FetchedPage> => {
  const resource = await fetchResource(url, fetchImpl);

  if (!isHtmlContentType(resource.contentType)) {
    const type = resource.contentType.split(';')[0]!.trim() || 'unknown type';

    throw new FetchPageError(url, `not an HTML page (${type})`);
  }

  return { url, finalUrl: resource.finalUrl, html: new TextDecoder().decode(resource.bytes) };
};
