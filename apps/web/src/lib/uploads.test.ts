import { describe, expect, it } from 'vitest';

import { contentDisposition, fileNameFor } from './uploads';

describe('fileNameFor', () => {
  it("keeps a title that already carries its type's extension", () => {
    expect(fileNameFor('limits.md', 'md')).toBe('limits.md');
    expect(fileNameFor('Guide.MARKDOWN', 'md')).toBe('Guide.MARKDOWN');
    expect(fileNameFor('report.pdf', 'pdf')).toBe('report.pdf');
  });

  it('adds the extension a title lacks', () => {
    expect(fileNameFor('Refund policy', 'md')).toBe('Refund policy.md');
    expect(fileNameFor('Handbook', 'docx')).toBe('Handbook.docx');
    expect(fileNameFor('notes.txt', 'pdf')).toBe('notes.txt.pdf');
  });

  it('drops what a header or a path cannot carry', () => {
    expect(fileNameFor('../../etc/"passwd"', 'txt')).toBe('.. .. etc passwd.txt');
    expect(fileNameFor('line\nbreak', null)).toBe('line break');
    expect(fileNameFor('   ', 'pdf')).toBe('file.pdf');
  });
});

describe('contentDisposition', () => {
  it('gives an ASCII name and the exact one for browsers that read UTF-8', () => {
    expect(contentDisposition('inline', 'Преза 2026.pdf')).toBe(
      `inline; filename="_ 2026.pdf"; filename*=UTF-8''${encodeURIComponent('Преза 2026.pdf')}`,
    );
    expect(contentDisposition('attachment', 'Handbook.docx')).toBe(
      `attachment; filename="Handbook.docx"; filename*=UTF-8''Handbook.docx`,
    );
  });
});
