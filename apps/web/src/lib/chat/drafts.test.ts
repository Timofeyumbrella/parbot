import { beforeEach, describe, expect, it } from 'vitest';

import { clearDraft, readDraft, resetDrafts, writeDraft } from './drafts';

beforeEach(() => {
  resetDrafts();
});

describe('drafts', () => {
  it('keeps unsent text per key', () => {
    writeDraft('c1', 'half a');
    writeDraft('c2', 'other');

    expect(readDraft('c1')).toBe('half a');
    expect(readDraft('c2')).toBe('other');
    expect(readDraft('c3')).toBe('');
  });

  it('forgets a draft that was emptied or cleared', () => {
    writeDraft('c1', 'text');
    writeDraft('c1', '');
    expect(readDraft('c1')).toBe('');

    writeDraft('c1', 'again');
    clearDraft('c1');
    expect(readDraft('c1')).toBe('');
  });
});
