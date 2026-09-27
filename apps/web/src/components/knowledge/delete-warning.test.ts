import { describe, expect, it } from 'vitest';

import { deleteWarning } from './source-row';

describe('deleteWarning', () => {
  it('agrees with a single page and with several', () => {
    expect(deleteWarning({ document_count: 1, storage_path: null })).toBe(
      "The page it added, and its passages, are removed from the assistant's knowledge. This cannot be undone.",
    );
    expect(deleteWarning({ document_count: 1204, storage_path: 'a/b/c.pdf' })).toBe(
      "The 1,204 pages it added, and their passages, are removed from the assistant's knowledge. The stored file is deleted too. This cannot be undone.",
    );
    expect(deleteWarning({ document_count: 0, storage_path: null })).toBe(
      'Nothing has been indexed from it yet. This cannot be undone.',
    );
  });
});
