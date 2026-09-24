/**
 * Titles for sources that arrive without one. Free of server-only imports: the Knowledge screen
 * uses it to draw a row before the server has answered.
 */

/** "docs.example.com/guide" for a website, "docs.example.com" for a sitemap. */
export const labelForUrl = (value: string, kind: 'url' | 'sitemap' = 'url') => {
  try {
    const url = new URL(value);
    const path = kind === 'url' ? url.pathname.replace(/\/+$/, '') : '';

    return `${url.host}${path}`.slice(0, 200);
  } catch {
    return value.slice(0, 200);
  }
};

/** True when a source's title is the one labelForUrl would have given it, not one a person chose. */
export const isAutoLabel = (title: string, uri: string | null, kind: 'url' | 'sitemap') =>
  uri !== null && title === labelForUrl(uri, kind);
