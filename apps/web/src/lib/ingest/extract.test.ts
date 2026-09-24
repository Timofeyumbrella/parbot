// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { checksumOf, extractText, extractUpload, markdownTitle } from './extract';

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
    const result = await extractUpload(bytes('﻿# Handbook\r\n\r\nLine one.\r\n\r\n\r\n\r\nLine two.   \r\n'), 'md');

    expect(result).toEqual({ title: 'Handbook', markdown: '# Handbook\n\nLine one.\n\nLine two.' });
  });

  it('keeps plain text without a title', async () => {
    await expect(extractUpload(bytes('Just words.\f\nMore words.'), 'txt')).resolves.toEqual({
      title: null,
      markdown: 'Just words.\n\nMore words.',
    });
  });

  it('runs HTML through the HTML pipeline', async () => {
    const html = '<html><head><title>Page</title></head><body><nav>skip</nav><main><h2>Section</h2><p>Body text here.</p></main></body></html>';
    const result = await extractUpload(bytes(html), 'html');

    expect(result.title).toBe('Page');
    expect(result.markdown).toContain('## Section');
    expect(result.markdown).toContain('Body text here.');
    expect(result.markdown).not.toContain('skip');
  });

  it('reads the text of a PDF', async () => {
    const result = await extractUpload(bytes(MINIMAL_PDF), 'pdf');

    expect(result.markdown).toContain('Hello Parbot');
  });
});

describe('extractText', () => {
  it('reads pasted Markdown back with its heading as the title', () => {
    expect(extractText(bytes('# Refunds\n\nWithin 30 days.'))).toEqual({ title: 'Refunds', markdown: '# Refunds\n\nWithin 30 days.' });
  });
});

/** A one-page PDF with a single text object, built by hand so the test needs no fixture file. */
const MINIMAL_PDF = (() => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = 'BT /F1 18 Tf 20 100 Td (Hello Parbot) Tj ET';

  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xref = body.length;

  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (const offset of offsets) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return body;
})();
