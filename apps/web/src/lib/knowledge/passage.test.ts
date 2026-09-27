import { describe, expect, it } from 'vitest';

import { chunkMarkdown } from '@/lib/ingest/chunk';

import { comparableText, matchPassage, passageText } from './passage';

const blocks = (...texts: string[]) => texts.map((text, index) => ({ text, item: index }));

describe('comparableText and passageText', () => {
  it('compares words only, whatever the Markdown around them', () => {
    expect(comparableText('  Rotate the **API key**, then `retry`!  ')).toBe(
      'rotate the api key then retry',
    );
    expect(passageText('See [the guide](https://docs.test/guide) and ![a chart](c.png).')).toBe(
      'see the guide and a chart',
    );
    expect(passageText('| Plan | Pages |\n| --- | --- |\n| Hobby | 100 |')).toBe(
      'plan pages hobby 100',
    );
  });
});

describe('matchPassage', () => {
  it('marks the blocks the passage is made of', () => {
    const matched = matchPassage(
      blocks(
        'Introduction to the product.',
        'Each workspace holds at most five projects.',
        'Exports run once per day.',
        'Unrelated closing words.',
      ),
      'Each workspace holds at most **five** projects.\n\n- Exports run once per day.',
    );

    expect(matched).toEqual([1, 2]);
  });

  it('marks a long paragraph the passage is a piece of', () => {
    const long = `${'Setup takes a few steps. '.repeat(10)}The last step signs the webhook payload with your secret.`;

    expect(
      matchPassage(
        blocks('Before.', long, 'After.'),
        'The last step signs the webhook payload with your secret.',
      ),
    ).toEqual([1]);
  });

  it('keeps only the longest run, so a line that recurs elsewhere is not lit', () => {
    const matched = matchPassage(
      blocks(
        'Limits apply to every workspace on the free plan.',
        'Something else entirely, not in the passage.',
        'Limits apply to every workspace on the free plan.',
        'Contact support to raise them for your workspace.',
      ),
      'Limits apply to every workspace on the free plan.\n\nContact support to raise them for your workspace.',
    );

    expect(matched).toEqual([2, 3]);
  });

  it('lights a short line or a heading only between longer parts of the passage', () => {
    const page = [
      { text: 'Refunds', item: 'h', heading: true },
      { text: 'Refunds are issued within 30 days of purchase.', item: 'p1' },
      { text: 'Note', item: 'short' },
      { text: 'Annual plans are refunded pro rata, by the day.', item: 'p2' },
      { text: 'Yes', item: 'trailing' },
    ];

    expect(
      matchPassage(
        page,
        'Refunds are issued within 30 days of purchase.\n\nNote\n\nAnnual plans are refunded pro rata, by the day.\n\nYes',
      ),
    ).toEqual(['p1', 'short', 'p2']);
    // A passage that is one short line is still found.
    expect(matchPassage(page, 'Note')).toEqual(['short']);
  });

  it('finds nothing for an empty passage or one the page does not contain', () => {
    expect(matchPassage(blocks('Anything.'), '   ')).toEqual([]);
    expect(matchPassage(blocks('Anything.'), 'Words that are not on the page.')).toEqual([]);
  });

  it('finds every chunk the chunker cut from a page', () => {
    const paragraphs = Array.from(
      { length: 12 },
      (_, index) =>
        `Paragraph ${index + 1} explains feature number ${index + 1} in enough words to fill space, with details about limits, retries and billing for that feature.`,
    );
    const markdown = `# Guide\n\n${paragraphs.join('\n\n')}`;
    const chunks = chunkMarkdown(markdown);

    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      const matched = matchPassage(blocks(...paragraphs), chunk.content);

      expect(matched.length).toBeGreaterThan(0);
      // The chunk's last paragraph is always among the marked ones.
      const last = chunk.content.split('\n\n').at(-1)!;

      expect(matched).toContain(paragraphs.indexOf(last));
    }
  });
});
