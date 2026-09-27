const SNIPPET_CHARS = 240;

/**
 * The passage text a citation carries for its hover card: whitespace collapsed, cut near 240
 * characters at a word boundary. The engine and the demo seed both use it, so a seeded citation
 * reads like a live one.
 */
export const citationSnippet = (content: string) => {
  const text = content.replace(/\s+/g, ' ').trim();

  if (text.length <= SNIPPET_CHARS) {
    return text;
  }

  const cut = text.slice(0, SNIPPET_CHARS);
  const lastSpace = cut.lastIndexOf(' ');

  return `${cut.slice(0, lastSpace > SNIPPET_CHARS - 40 ? lastSpace : cut.length).trimEnd()}…`;
};

type GroupableCitation = {
  index: number;
  url: string | null;
  /** Stored rows are only checked for an index and a title, and the scripted demo has none. */
  documentId?: string | null;
};

/** A cited page and every marker that points at it, markers ascending. */
export type CitedPage<T extends GroupableCitation> = {
  /** The page's first citation in `members`: its title and url stand for the page. */
  citation: T;
  indexes: number[];
  members: T[];
};

const pageKey = ({ documentId, url, index }: GroupableCitation) =>
  documentId ? `document:${documentId}` : url ? `url:${url}` : `index:${index}`;

/**
 * One entry per page, in the order the citations arrive. An answer often cites several passages
 * of the same page; the page is listed once with all its markers so the row stays short and a
 * reader can still match any marker to its source. A citation with neither a document nor a url
 * stands alone rather than being merged by title, since two pasted notes can share a name.
 */
export const groupCitationsByPage = <T extends GroupableCitation>(citations: readonly T[]) => {
  const pages = new Map<string, T[]>();

  for (const citation of citations) {
    const key = pageKey(citation);
    const members = pages.get(key);

    if (!members) {
      pages.set(key, [citation]);
    } else if (!members.some((member) => member.index === citation.index)) {
      members.push(citation);
    }
  }

  return [...pages.values()].map((members): CitedPage<T> => {
    const sorted = [...members].sort((a, b) => a.index - b.index);

    return { citation: members[0]!, indexes: sorted.map(({ index }) => index), members: sorted };
  });
};

/** The same pages ordered by their lowest marker, for a row read as a numbered list. */
export const groupCitationsByPageAscending = <T extends GroupableCitation>(
  citations: readonly T[],
) => groupCitationsByPage([...citations].sort((a, b) => a.index - b.index));
