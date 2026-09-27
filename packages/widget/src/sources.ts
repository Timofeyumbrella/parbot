import type { StoredCitation } from './storage';

/** One cited document under an answer, with every marker in the answer that points at it. */
export type SourceRow = {
  /** Ascending, so the row reads "1 2" whatever order the answer cites them in. */
  indexes: number[];
  title: string;
  url: string | null;
};

const documentKey = ({ documentId, url, index }: StoredCitation) =>
  documentId ? `document:${documentId}` : url ? `url:${url}` : `index:${index}`;

/**
 * One row per cited document, the way the app's Sources row reads ("1 2 HonoRequest - Hono").
 * An answer often cites several passages of one page, and a row per passage repeated the page's
 * title as many times. Rows go by their lowest marker, so the list follows the numbers in the
 * answer. A transcript saved before the widget kept document ids groups by url instead, and a
 * citation with neither stands alone, since two pasted notes can share a title.
 */
export const groupSources = (citations: readonly StoredCitation[]): SourceRow[] => {
  const rows = new Map<string, SourceRow>();

  for (const citation of [...citations].sort((a, b) => a.index - b.index)) {
    const key = documentKey(citation);
    const row = rows.get(key);

    if (!row) {
      rows.set(key, { indexes: [citation.index], title: citation.title, url: citation.url });
    } else if (!row.indexes.includes(citation.index)) {
      row.indexes.push(citation.index);
    }
  }

  return [...rows.values()];
};
