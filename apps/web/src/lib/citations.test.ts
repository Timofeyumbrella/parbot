import { describe, expect, it } from 'vitest';

import { groupCitationsByPage, groupCitationsByPageAscending } from './citations';

const cite = (index: number, documentId: string | undefined, url: string | null = null) => ({
  index,
  documentId,
  url,
  title: documentId ?? `untitled ${index}`,
});

describe('groupCitationsByPage', () => {
  it('lists a page once with all its markers ascending, pages in the order they arrive', () => {
    const pages = groupCitationsByPage([cite(5, 'install'), cite(2, 'auth'), cite(1, 'install')]);

    expect(pages.map(({ citation, indexes }) => [citation.title, indexes])).toEqual([
      ['install', [1, 5]],
      ['auth', [2]],
    ]);
    expect(pages[0]!.members.map(({ index }) => index)).toEqual([1, 5]);
  });

  it('merges citations without a document by url and keeps bare ones apart', () => {
    const pages = groupCitationsByPage([
      cite(1, undefined, 'https://docs.acme.test/a'),
      cite(2, undefined, null),
      cite(3, undefined, 'https://docs.acme.test/a'),
      cite(4, undefined, null),
    ]);

    expect(pages.map(({ indexes }) => indexes)).toEqual([[1, 3], [2], [4]]);
  });

  it('ignores a repeated marker', () => {
    expect(
      groupCitationsByPage([cite(1, 'a'), cite(1, 'a')]).map(({ indexes }) => indexes),
    ).toEqual([[1]]);
  });
});

describe('groupCitationsByPageAscending', () => {
  it('orders pages by their lowest marker', () => {
    const pages = groupCitationsByPageAscending([
      cite(2, 'install'),
      cite(3, 'auth'),
      cite(1, 'install'),
    ]);

    expect(pages.map(({ citation, indexes }) => [citation.title, indexes])).toEqual([
      ['install', [1, 2]],
      ['auth', [3]],
    ]);
  });
});
