import { describe, expect, it } from 'vitest';

import {
  addReference,
  chipStatus,
  filterReferenceOptions,
  findMention,
  MAX_REFERENCES,
  parseReferences,
  type ReferenceOption,
  removeMention,
  uploadingMessage,
} from './references';

describe('findMention', () => {
  it('finds an @ at the start or after a space, with what follows it up to the caret', () => {
    expect(findMention('@', 1)).toEqual({ start: 0, query: '' });
    expect(findMention('What does @lim', 14)).toEqual({ start: 10, query: 'lim' });
    expect(findMention('What does @Refund pol', 21)).toEqual({ start: 10, query: 'Refund pol' });
    // The caret decides: text after it is not part of the query.
    expect(findMention('What does @limits say', 17)).toEqual({ start: 10, query: 'limits' });
  });

  it('ignores an email address, a space right after the @, a new line and a long run', () => {
    expect(findMention('mail me@acme.test', 17)).toBeNull();
    expect(findMention('pay @ home', 10)).toBeNull();
    expect(findMention('@guide\nnext line', 16)).toBeNull();
    expect(findMention(`@${'x'.repeat(61)}`, 62)).toBeNull();
    expect(findMention('no mention here', 15)).toBeNull();
  });
});

describe('removeMention', () => {
  it('takes the @query out and puts the caret where it was', () => {
    expect(removeMention('What does @lim', { start: 10, query: 'lim' }, 14)).toEqual({
      text: 'What does ',
      caret: 10,
    });
    expect(removeMention('Read @lim and tell me', { start: 5, query: 'lim' }, 9)).toEqual({
      text: 'Read and tell me',
      caret: 5,
    });
    expect(removeMention('@', { start: 0, query: '' }, 1)).toEqual({ text: '', caret: 0 });
  });
});

const option = (title: string, patch: Partial<ReferenceOption> = {}): ReferenceOption => ({
  id: title,
  title,
  kind: 'upload',
  status: 'ready',
  detail: 'PDF file · 10 KB',
  createdAt: '2026-09-20T00:00:00Z',
  ...patch,
});

describe('filterReferenceOptions', () => {
  const options = [
    option('Billing FAQ', { createdAt: '2026-09-21T00:00:00Z' }),
    option('limits.md', { createdAt: '2026-09-22T00:00:00Z' }),
    option('Rate limits', { createdAt: '2026-09-23T00:00:00Z' }),
    option('Unlimited plans', { createdAt: '2026-09-24T00:00:00Z' }),
    option('Docs site', { kind: 'url', detail: 'https://limits.acme.test/' }),
  ];

  it('lists everything newest first for a bare @', () => {
    expect(filterReferenceOptions(options, '').map((item) => item.title)).toEqual([
      'Unlimited plans',
      'Rate limits',
      'limits.md',
      'Billing FAQ',
      'Docs site',
    ]);
  });

  it('ranks the start of the title, then a word, then anywhere, then the address', () => {
    expect(filterReferenceOptions(options, 'LIMIT').map((item) => item.title)).toEqual([
      'limits.md',
      'Rate limits',
      'Unlimited plans',
      'Docs site',
    ]);
    expect(filterReferenceOptions(options, 'nothing')).toEqual([]);
  });
});

describe('addReference', () => {
  it('adds once, at the end, and stops at the limit', () => {
    const one = { id: 'a', title: 'A', kind: 'upload' as const };

    expect(addReference([one], { ...one })).toEqual([one]);
    expect(addReference([one], { id: 'b', title: 'B', kind: 'text' }).map((r) => r.id)).toEqual([
      'a',
      'b',
    ]);

    const full = Array.from({ length: MAX_REFERENCES }, (_, index) => ({
      id: `r${index}`,
      title: `R${index}`,
      kind: 'text' as const,
    }));

    expect(addReference(full, { id: 'extra', title: 'Extra', kind: 'text' })).toBe(full);
  });
});

describe('parseReferences', () => {
  it('keeps well-formed references and drops the rest', () => {
    expect(
      parseReferences([
        { id: 'a', title: 'A', kind: 'upload', extra: true },
        { id: 'b', title: 'B', kind: 'folder' },
        { id: 3, title: 'C', kind: 'text' },
        'nonsense',
      ]),
    ).toEqual([{ id: 'a', title: 'A', kind: 'upload' }]);
    expect(parseReferences(null)).toEqual([]);
    expect(parseReferences({ id: 'a' })).toEqual([]);
  });
});

describe('chipStatus', () => {
  it('follows the upload first, then the source row', () => {
    expect(chipStatus({ upload: { status: 'uploading' }, loaded: true })).toBe('uploading');
    expect(chipStatus({ upload: { status: 'failed', error: 'Too big.' }, loaded: true })).toBe(
      'failed',
    );
    expect(chipStatus({ upload: { status: 'saved' }, loaded: true })).toBe('indexing');
    expect(
      chipStatus({ upload: { status: 'saved' }, source: { status: 'ready' }, loaded: true }),
    ).toBe('ready');
    expect(chipStatus({ source: { status: 'queued' }, loaded: true })).toBe('indexing');
    expect(chipStatus({ source: { status: 'crawling' }, loaded: true })).toBe('indexing');
    expect(chipStatus({ source: { status: 'failed' }, loaded: true })).toBe('failed');
  });

  it('calls a source the loaded list lacks removed, and claims nothing before it loads', () => {
    expect(chipStatus({ loaded: true })).toBe('missing');
    expect(chipStatus({ loaded: false })).toBe('unknown');
  });
});

describe('uploadingMessage', () => {
  it('names the file, or the first and how many more', () => {
    expect(uploadingMessage(['limits.md'])).toBe('Uploading limits.md…');
    expect(uploadingMessage(['limits.md', 'a.pdf'])).toBe('Uploading limits.md and 1 more…');
  });
});
