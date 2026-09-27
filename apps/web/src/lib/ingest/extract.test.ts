// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { chunkMarkdown } from './chunk';
import { checksumOf, extractText, extractUpload, markdownTitle } from './extract';
import { buildPdf, layoutPdf, minimalPdf } from './fixtures/pdf';

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

describe('extractUpload with the layout of a PDF', () => {
  const handbook = [
    '# Handbook',
    'Welcome to the Parbot handbook. It explains how the assistant answers, where its knowledge comes from and what to do when it is wrong.',
    '## Refunds',
    'Refunds are issued within 30 days of purchase. They go back to the card that paid, and the customer gets an email once the bank has the money.',
    'Contact support with the order number to start one.',
    '## Shipping',
    'Orders leave the warehouse within two working days.',
  ].join('\n\n');

  it('rebuilds headings and paragraphs, so the file chunks like the same Markdown', async () => {
    const pdf = layoutPdf([
      { heading: 'Handbook', level: 1 },
      {
        paragraph:
          'Welcome to the Parbot handbook. It explains how the assistant answers, where its knowledge comes from and what to do when it is wrong.',
      },
      { heading: 'Refunds' },
      {
        paragraph:
          'Refunds are issued within 30 days of purchase. They go back to the card that paid, and the customer gets an email once the bank has the money.',
      },
      { paragraph: 'Contact support with the order number to start one.' },
      { heading: 'Shipping' },
      { paragraph: 'Orders leave the warehouse within two working days.' },
    ]);
    const result = await extractUpload(pdf, 'pdf');

    // With no title in its metadata, the file is named after its first heading, as Markdown is.
    expect(result).toEqual({ title: 'Handbook', markdown: handbook });
    // One passage per section and a citation lights one section, not half the file.
    expect(chunkMarkdown(result.markdown)).toEqual(chunkMarkdown(handbook));
    expect(chunkMarkdown(result.markdown).map((chunk) => chunk.heading)).toEqual([
      'Handbook',
      'Handbook › Refunds',
      'Handbook › Shipping',
    ]);
  });

  it('keeps bulleted and numbered lists, each wrapped item in one piece', async () => {
    const pdf = layoutPdf([
      { heading: 'Returns' },
      { paragraph: 'Before you send anything back:' },
      {
        bullets: [
          'Keep the original packaging, including the inserts and the plastic film that protects the screen.',
          'Print the label.',
        ],
      },
      { steps: ['Open Billing.', 'Pick the invoice and choose Refund.'] },
      { paragraph: 'The refund shows up within a week.' },
    ]);
    const { markdown } = await extractUpload(pdf, 'pdf');

    expect(markdown).toBe(
      [
        '# Returns',
        'Before you send anything back:',
        [
          '- Keep the original packaging, including the inserts and the plastic film that protects the screen.',
          '- Print the label.',
          '1. Open Billing.',
          '2. Pick the invoice and choose Refund.',
        ].join('\n'),
        'The refund shows up within a week.',
      ].join('\n\n'),
    );
  });

  it('reads a two-page file as one document, joining a paragraph that runs over the break', async () => {
    const pdf = layoutPdf(
      [
        { heading: 'Billing guide', level: 1 },
        { paragraph: 'Invoices are sent on the first day of each month.' },
        { lines: ['A refund is paid back to the card that was charged, and the bank takes'] },
        { pageBreak: true },
        { lines: ['up to five working days to show it.'] },
        { heading: 'Taxes' },
        { paragraph: 'Prices include VAT where it applies.' },
      ],
      { pageNumbers: true },
    );
    const result = await extractUpload(pdf, 'pdf');

    expect(result.title).toBe('Billing guide');
    // The page numbers at the foot of each page are not part of the text.
    expect(result.markdown).toBe(
      [
        '# Billing guide',
        'Invoices are sent on the first day of each month.',
        'A refund is paid back to the card that was charged, and the bank takes up to five working days to show it.',
        '## Taxes',
        'Prices include VAT where it applies.',
      ].join('\n\n'),
    );
  });

  it('joins a word hyphenated at the end of a line, and keeps a hyphen that belongs', async () => {
    const pdf = layoutPdf([
      {
        lines: [
          'The assistant answers from all the infor-',
          'mation you add, like the page about Wi-',
          'Fi setup or the opening hours in COVID-',
          '19 times.',
        ],
      },
    ]);
    const { markdown } = await extractUpload(pdf, 'pdf');

    expect(markdown).toBe(
      'The assistant answers from all the information you add, like the page about Wi-Fi setup or the opening hours in COVID-19 times.',
    );
  });

  it('keeps code set in a fixed-width font as a code block, indented as it was', async () => {
    const pdf = layoutPdf([
      { heading: 'Install' },
      { paragraph: 'Add the package and start it:' },
      { code: ['npm install parbot', 'parbot init {', '  "key": "pb_123"', '}'] },
      { paragraph: 'The key is on the Widget page.' },
    ]);
    const { markdown } = await extractUpload(pdf, 'pdf');

    expect(markdown).toBe(
      [
        '# Install',
        'Add the package and start it:',
        '```\nnpm install parbot\nparbot init {\n  "key": "pb_123"\n}\n```',
        'The key is on the Widget page.',
      ].join('\n\n'),
    );
  });

  it('follows a two-column page down one column and then the next', async () => {
    const line = (text: string, x: number, y: number, size = 11) => ({ text, x, y, size });
    // Columns are written one after the other, as layout programs do; a sentence runs from the
    // foot of the left column to the top of the right one.
    const pdf = buildPdf([
      [
        line('Release notes', 72, 700, 20),
        line('Version 2 adds a command palette that', 72, 660),
        line('opens with a shortcut and searches every', 72, 645.7),
        line('page of the documentation while the reader', 72, 631.4),
        line('types, and it keeps the last question in', 72, 617.1),
        line('the box until the reader clears it.', 320, 660),
        line('Fixes', 320, 628, 16),
        line('Long answers no longer cut off at the end.', 320, 605),
      ],
    ]);
    const { markdown } = await extractUpload(pdf, 'pdf');

    expect(markdown).toBe(
      [
        '# Release notes',
        'Version 2 adds a command palette that opens with a shortcut and searches every page of the documentation while the reader types, and it keeps the last question in the box until the reader clears it.',
        '## Fixes',
        'Long answers no longer cut off at the end.',
      ].join('\n\n'),
    );
  });

  it('names the file after its first heading when the metadata title is a placeholder', async () => {
    const pdf = layoutPdf(
      [{ heading: 'Handbook', level: 1 }, { paragraph: 'Welcome to the Parbot handbook.' }],
      { title: 'Microsoft Word - handbook.docx' },
    );

    await expect(extractUpload(pdf, 'pdf')).resolves.toMatchObject({ title: 'Handbook' });
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
