import { describe, expect, it } from 'vitest';

import { groupSources } from './sources';

const hono = (index: number) => ({
  index,
  documentId: 'd-context',
  title: 'Context - Hono',
  url: 'https://hono.dev/docs/api/context',
});

describe('groupSources', () => {
  it('lists a document once with every number that cites it, ascending', () => {
    expect(groupSources([hono(5), hono(2), hono(3)])).toEqual([
      { indexes: [2, 3, 5], title: 'Context - Hono', url: 'https://hono.dev/docs/api/context' },
    ]);
  });

  it('orders the rows by their first number, not by first mention in the answer', () => {
    const rows = groupSources([
      hono(3),
      { index: 1, documentId: 'd-request', title: 'HonoRequest - Hono', url: null },
      hono(2),
    ]);

    expect(rows.map(({ indexes, title }) => [indexes, title])).toEqual([
      [[1], 'HonoRequest - Hono'],
      [[2, 3], 'Context - Hono'],
    ]);
  });

  it('falls back to the link for a citation without a document id', () => {
    const url = 'https://hono.dev/docs/api/context';

    expect(
      groupSources([
        { index: 2, title: 'Context - Hono', url },
        { index: 1, title: 'Context - Hono', url },
      ]),
    ).toEqual([{ indexes: [1, 2], title: 'Context - Hono', url }]);
  });

  it('keeps two unlinked notes apart even when they share a title', () => {
    expect(
      groupSources([
        { index: 1, title: 'Notes', url: null },
        { index: 2, title: 'Notes', url: null },
      ]),
    ).toEqual([
      { indexes: [1], title: 'Notes', url: null },
      { indexes: [2], title: 'Notes', url: null },
    ]);
  });

  it('lists a number once when the answer repeats a citation', () => {
    expect(groupSources([hono(1), hono(1)])).toEqual([
      { indexes: [1], title: 'Context - Hono', url: 'https://hono.dev/docs/api/context' },
    ]);
  });
});
