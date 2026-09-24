import { describe, expect, it } from 'vitest';

import { describeSource, isActiveStatus, plural } from './format';

describe('describeSource', () => {
  it('shows the address for web sources and the file type and size otherwise', () => {
    expect(describeSource({ kind: 'url', uri: 'https://docs.example.com/guide/', storage_path: null, mime_type: null, byte_size: null })).toBe(
      'https://docs.example.com/guide/',
    );
    expect(
      describeSource({ kind: 'upload', uri: null, storage_path: 'u/a/x.pdf', mime_type: 'application/pdf', byte_size: 2_500_000 }),
    ).toBe('PDF file · 2.4 MB');
    expect(describeSource({ kind: 'text', uri: null, storage_path: 'u/a/x.md', mime_type: 'text/markdown', byte_size: 512 })).toBe(
      'Pasted text · 512 B',
    );
  });
});

describe('plural and isActiveStatus', () => {
  it('formats counts and knows which statuses still move', () => {
    expect(plural(1, 'page')).toBe('1 page');
    expect(plural(1200, 'passage')).toBe('1,200 passages');
    expect(isActiveStatus('queued')).toBe(true);
    expect(isActiveStatus('indexing')).toBe(true);
    expect(isActiveStatus('ready')).toBe(false);
    expect(isActiveStatus('failed')).toBe(false);
  });
});
