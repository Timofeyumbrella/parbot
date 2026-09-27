import { describe, expect, it } from 'vitest';

import { type PdfRun, pdfRunsToMarkdown } from './pdf';

/** A run the way pdf.js reports one; the width follows Helvetica's average letter. */
const run = (text: string, x: number, y: number, options: Partial<PdfRun> = {}): PdfRun => {
  const size = options.size ?? 11;

  return {
    text,
    x,
    y,
    width: text.length * size * 0.5,
    size,
    monospace: false,
    eol: false,
    upright: true,
    ...options,
  };
};

/** Lines of body text down a page, each one run with an end-of-line mark. */
const paragraph = (lines: string[], top: number, x = 72) =>
  lines.map((text, index) => run(text, x, top - index * 14, { eol: true }));

describe('pdfRunsToMarkdown', () => {
  it('starts a new line where the baseline moves, even when pdf.js marks no line end', () => {
    const markdown = pdfRunsToMarkdown([
      [
        run('Plans', 72, 700, { size: 18 }),
        run('Hobby is free for one small site.', 72, 670),
        run('Starter adds the palette.', 72, 640),
      ],
    ]);

    expect(markdown).toBe(
      '# Plans\n\nHobby is free for one small site.\n\nStarter adds the palette.',
    );
  });

  it('keeps a superscript and inline code of another size on their line and in their paragraph', () => {
    const markdown = pdfRunsToMarkdown([
      [
        run('Answers cite pages', 72, 700),
        run('1', 162, 704, { size: 7 }),
        run(' and read the', 166, 700),
        run('data-mode', 243, 700, { size: 9.5, monospace: true, eol: true }),
        run('attribute of the script tag.', 72, 686, { eol: true }),
      ],
    ]);

    expect(markdown).toBe(
      'Answers cite pages1 and read the data-mode attribute of the script tag.',
    );
  });

  it('puts a space between runs a word gap apart, and none inside a word split into runs', () => {
    const markdown = pdfRunsToMarkdown([
      [
        // "Upload" ends at 105; the ligature "fi" is its own run, drawn flush against "les".
        run('Upload', 72, 700),
        run('fi', 108.5, 700, { width: 5 }),
        run('les', 113.5, 700),
        run('up to 25 MB.', 134, 700),
      ],
    ]);

    expect(markdown).toBe('Upload files up to 25 MB.');
  });

  it('keeps the hyphen of a code name broken over two lines', () => {
    const markdown = pdfRunsToMarkdown([
      [
        run('Set', 72, 700),
        run('data-', 92, 700, { monospace: true, eol: true }),
        run('scheme', 72, 686, { monospace: true }),
        run('on the tag to match your theme.', 110, 686, { eol: true }),
      ],
    ]);

    expect(markdown).toBe('Set data-scheme on the tag to match your theme.');
  });

  it('marks paragraphs by a first-line indent when the file leaves no gap between them', () => {
    const lines = [
      run('The widget loads after the page and never blocks', 90, 700, { eol: true }),
      run('it. It keeps its styles to itself in a shadow root', 72, 686, { eol: true }),
      run('so the page cannot restyle it.', 72, 672, { eol: true }),
      run('Answers stream in as the model writes them, so the', 90, 658, { eol: true }),
      run('first words show within a second.', 72, 644, { eol: true }),
    ];

    expect(pdfRunsToMarkdown([lines])).toBe(
      [
        'The widget loads after the page and never blocks it. It keeps its styles to itself in a shadow root so the page cannot restyle it.',
        'Answers stream in as the model writes them, so the first words show within a second.',
      ].join('\n\n'),
    );
  });

  it('keeps lines apart that end early on purpose, as lists drawn without bullet characters do', () => {
    const markdown = pdfRunsToMarkdown([
      [
        ...paragraph(
          [
            'Parbot reads websites, sitemaps, PDF and Word files, Markdown, HTML and text',
            'that you paste into the dialog, and indexes all of it within a minute or two.',
          ],
          700,
        ),
        ...paragraph(['A Parbot account.', 'About ten minutes.'], 670, 90),
      ],
    ]);

    expect(markdown).toBe(
      [
        'Parbot reads websites, sitemaps, PDF and Word files, Markdown, HTML and text that you paste into the dialog, and indexes all of it within a minute or two.',
        'A Parbot account.',
        'About ten minutes.',
      ].join('\n\n'),
    );
  });

  it('nests list items by their indent', () => {
    const markdown = pdfRunsToMarkdown([
      [
        run('Before you start:', 72, 700, { eol: true }),
        run('• Create an account.', 80, 686, { eol: true }),
        run('• Add sources:', 80, 672, { eol: true }),
        run('◦ a website,', 98, 658, { eol: true }),
        run('◦ a file.', 98, 644, { eol: true }),
        run('• Install the widget.', 80, 630, { eol: true }),
      ],
    ]);

    expect(markdown).toBe(
      [
        'Before you start:',
        '- Create an account.\n- Add sources:\n  - a website,\n  - a file.\n- Install the widget.',
      ].join('\n\n'),
    );
  });

  it('reads a number that starts a wrapped line as text, not as a list', () => {
    const markdown = pdfRunsToMarkdown([
      paragraph(
        ['Indexing runs in the background and finished in', '2026. or earlier releases.'],
        700,
      ),
    ]);

    expect(markdown).toBe(
      'Indexing runs in the background and finished in 2026. or earlier releases.',
    );
  });

  it('escapes body text that Markdown would read as a heading, a quote or a list', () => {
    const markdown = pdfRunsToMarkdown([
      [
        ...paragraph(['# of seats is shown on Billing.'], 700),
        ...paragraph(['> 5 seats need Growth.'], 670),
        ...paragraph(['2026. The year the widget shipped.'], 640),
      ],
    ]);

    expect(markdown).toBe(
      [
        '\\# of seats is shown on Billing.',
        '\\> 5 seats need Growth.',
        '2026\\. The year the widget shipped.',
      ].join('\n\n'),
    );
  });

  it('leaves out page numbers and a running header, and keeps a title at the top of page one', () => {
    const page = (number: number, body: string) => [
      run('Parbot handbook', 72, 760, { size: 9, eol: true }),
      run(body, 72, 700, { eol: true }),
      run(`Page ${number} of 3`, 280, 40, { size: 9, eol: true }),
    ];
    const markdown = pdfRunsToMarkdown([
      [run('Parbot handbook', 72, 730, { size: 22, eol: true }), ...page(1, 'Welcome.')],
      page(2, 'Refunds take a week.'),
      page(3, 'Shipping is free.'),
    ]);

    expect(markdown).toBe(
      '# Parbot handbook\n\nWelcome.\n\nRefunds take a week.\n\nShipping is free.',
    );
  });

  it('does not take large rotated text, such as a watermark, for a heading', () => {
    const markdown = pdfRunsToMarkdown([
      [
        run('DRAFT', 200, 400, { size: 60, upright: false, eol: true }),
        ...paragraph(['Refunds are issued within 30 days.'], 700),
      ],
    ]);

    expect(markdown).not.toContain('#');
    expect(markdown).toContain('Refunds are issued within 30 days.');
  });

  it('reads a document typed entirely in a fixed-width font as text, not code', () => {
    const markdown = pdfRunsToMarkdown([
      [
        run('Release notes', 72, 700, { monospace: true, eol: true }),
        run('The palette opens with Ctrl K.', 72, 686, { monospace: true, eol: true }),
      ],
    ]);

    expect(markdown).toBe('Release notes The palette opens with Ctrl K.');
  });

  it('gives nothing for a file without text', () => {
    expect(pdfRunsToMarkdown([[], [run('   ', 72, 700, { eol: true })]])).toBe('');
  });
});
