// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { checksumOf, extractText, extractUpload, markdownTitle } from './extract';
import { minimalPdf } from './fixtures/pdf';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('checksumOf', () => {
  it('is stable for the same Markdown and different otherwise', () => {
    expect(checksumOf('# A\n\ntext')).toBe(checksumOf('# A\n\ntext'));
    expect(checksumOf('# A\n\ntext')).not.toBe(checksumOf('# A\n\ntext.'));
    expect(checksumOf('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('markdownTitle', () => {
  it('takes the first level one or two heading', () => {
    expect(markdownTitle('intro\n\n## Setup\n\n# Later')).toBe('Setup');
    expect(markdownTitle('### Too deep')).toBeNull();
  });
});

describe('extractUpload', () => {
  it('keeps Markdown as it is, normalised, and names it after the first heading', async () => {
    const result = await extractUpload(
      bytes('﻿# Handbook\r\n\r\nLine one.\r\n\r\n\r\n\r\nLine two.   \r\n'),
      'md',
    );

    expect(result).toEqual({ title: 'Handbook', markdown: '# Handbook\n\nLine one.\n\nLine two.' });
  });

  it('keeps plain text without a title', async () => {
    await expect(extractUpload(bytes('Just words.\f\nMore words.'), 'txt')).resolves.toEqual({
      title: null,
      markdown: 'Just words.\n\nMore words.',
    });
  });

  it('runs HTML through the HTML pipeline', async () => {
    const html =
      '<html><head><title>Page</title></head><body><nav>skip</nav><main><h2>Section</h2><p>Body text here.</p></main></body></html>';
    const result = await extractUpload(bytes(html), 'html');

    expect(result.title).toBe('Page');
    expect(result.markdown).toContain('## Section');
    expect(result.markdown).toContain('Body text here.');
    expect(result.markdown).not.toContain('skip');
  });

  it('reads the text of a PDF and the title it carries', async () => {
    const result = await extractUpload(minimalPdf('Hello Parbot', 'Welcome guide'), 'pdf');

    expect(result).toEqual({ title: 'Welcome guide', markdown: 'Hello Parbot' });
  });

  it('reads a Word file, keeping its headings and emphasis as Markdown', async () => {
    const docx = new Uint8Array(readFileSync(new URL('./fixtures/handbook.docx', import.meta.url)));
    const result = await extractUpload(docx, 'docx');

    expect(result.title).toBe('Handbook');
    expect(result.markdown).toBe(
      [
        '# Handbook',
        'Welcome to the Parbot handbook. It explains how the assistant answers.',
        '## Refunds',
        '**Refunds are issued within 30 days of purchase.**',
        'Contact support with the order number to start one.',
      ].join('\n\n'),
    );
  });
});

describe('extractText', () => {
  it('reads pasted Markdown back with its heading as the title', () => {
    expect(extractText(bytes('# Refunds\n\nWithin 30 days.'))).toEqual({
      title: 'Refunds',
      markdown: '# Refunds\n\nWithin 30 days.',
    });
  });
});

describe('extractUpload with damaged files', () => {
  it('explains a Word file that is not really a docx', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(extractUpload(bytes('this is not a zip archive'), 'docx')).rejects.toThrow(
      'This Word file could not be read. Open it in Word, save it as .docx and upload it once more.',
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('explains a PDF that cannot be parsed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(extractUpload(bytes('%PDF-1.4 garbage'), 'pdf')).rejects.toThrow(
      'This PDF could not be read.',
    );
    warn.mockRestore();
  });
});
