// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { CHUNK_OVERLAP, CHUNK_TARGET, chunkMarkdown, estimateTokens, MAX_CODE_CHARS, overlapTail, parseBlocks } from './chunk';

const sentence = (index: number) => `Sentence number ${index} explains one small thing about the product in plain words.`;

/** A paragraph of roughly `chars` characters made of whole sentences. */
const paragraph = (chars: number, seed = 0) => {
  let text = '';
  let index = seed;

  while (text.length < chars) {
    text += (text ? ' ' : '') + sentence(index);
    index += 1;
  }

  return text;
};

describe('parseBlocks', () => {
  it('separates headings, paragraphs and fenced code in document order', () => {
    const blocks = parseBlocks('# Title\n\nFirst para\nstill first\n\n```ts\nconst a = 1;\n```\n\nSecond');

    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'paragraph', text: 'First para\nstill first' },
      { kind: 'code', fence: '```', info: 'ts', lines: ['const a = 1;'] },
      { kind: 'paragraph', text: 'Second' },
    ]);
  });

  it('does not mistake a heading-looking line inside a code block for a heading', () => {
    const blocks = parseBlocks('```sh\n# not a heading\n```');

    expect(blocks).toEqual([{ kind: 'code', fence: '```', info: 'sh', lines: ['# not a heading'] }]);
  });
});

describe('chunkMarkdown', () => {
  it('carries the heading path into every chunk', () => {
    const markdown = [
      '# Guide',
      'Intro text.',
      '## Authentication',
      'How auth works.',
      '### API keys',
      'Create keys in Settings.',
      '## Webhooks',
      'Events are signed.',
    ].join('\n\n');

    const chunks = chunkMarkdown(markdown);

    expect(chunks.map((chunk) => chunk.heading)).toEqual([
      'Guide',
      'Guide › Authentication',
      'Guide › Authentication › API keys',
      'Guide › Webhooks',
    ]);
    expect(chunks[2]?.content).toBe('Create keys in Settings.');
  });

  it('leaves the heading empty before the first heading', () => {
    const chunks = chunkMarkdown('Preamble.\n\n# Later');

    expect(chunks).toEqual([{ heading: null, content: 'Preamble.', tokenCount: estimateTokens('Preamble.') }]);
  });

  it('packs paragraphs to the target and overlaps the next chunk with the previous tail', () => {
    const paragraphs = [paragraph(500, 0), paragraph(500, 10), paragraph(500, 20), paragraph(500, 30)];
    const chunks = chunkMarkdown(`# Section\n\n${paragraphs.join('\n\n')}`);

    expect(chunks.length).toBeGreaterThanOrEqual(2);

    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_TARGET);
      expect(chunk.heading).toBe('Section');
    }

    const [first, second] = chunks;
    const tail = overlapTail(first!.content, CHUNK_OVERLAP);

    expect(tail.length).toBeGreaterThan(0);
    expect(tail.length).toBeLessThanOrEqual(CHUNK_OVERLAP);
    expect(second!.content.startsWith(tail)).toBe(true);
    expect(second!.content).toContain(paragraphs[2]);
  });

  it('cuts the overlap at a word boundary', () => {
    const text = 'alpha beta gamma delta epsilon zeta eta theta';

    expect(overlapTail(text, 12)).toBe('eta theta');
    expect(overlapTail(text, 10)).toBe('eta theta');
    expect(overlapTail('short', 10)).toBe('');
  });

  it('splits an oversized paragraph at sentence boundaries', () => {
    const chunks = chunkMarkdown(paragraph(3000));

    expect(chunks.length).toBeGreaterThan(2);

    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_TARGET);
      expect(chunk.content.trimEnd().endsWith('.')).toBe(true);
    }
  });

  it('keeps a long fenced code block whole in a chunk of its own', () => {
    const lines = Array.from({ length: 60 }, (_, index) => `const value${index} = compute(${index}); // line ${index}`);
    const code = `\`\`\`ts\n${lines.join('\n')}\n\`\`\``;
    const chunks = chunkMarkdown(`# Example\n\nBefore.\n\n${code}\n\nAfter.`);

    expect(code.length).toBeGreaterThan(CHUNK_TARGET);
    expect(code.length).toBeLessThanOrEqual(MAX_CODE_CHARS);

    const codeChunk = chunks.find((chunk) => chunk.content.startsWith('```ts'));

    expect(codeChunk?.content).toBe(code);
    expect(chunks.map((chunk) => chunk.content)).toEqual(['Before.', code, 'After.']);
  });

  it('cuts a code block longer than the ceiling at line boundaries and re-fences each piece', () => {
    const lines = Array.from({ length: 200 }, (_, index) => `line ${index}: ${'x'.repeat(40)}`);
    const chunks = chunkMarkdown(`\`\`\`txt\n${lines.join('\n')}\n\`\`\``);

    expect(chunks.length).toBeGreaterThan(1);

    const rejoined: string[] = [];

    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(MAX_CODE_CHARS);
      expect(chunk.content.startsWith('```txt\n')).toBe(true);
      expect(chunk.content.endsWith('\n```')).toBe(true);
      rejoined.push(...chunk.content.slice('```txt\n'.length, -'\n```'.length).split('\n'));
    }

    expect(rejoined).toEqual(lines);
  });

  it('never starts a chunk with an overlap after a code block', () => {
    const chunks = chunkMarkdown(`${paragraph(1100)}\n\n\`\`\`js\nrun();\n\`\`\`\n\n${paragraph(1100, 50)}`);

    const codeIndex = chunks.findIndex((chunk) => chunk.content.includes('run();'));

    expect(codeIndex).toBeGreaterThan(0);
    expect(chunks[codeIndex + 1]?.content.startsWith('Sentence number 50')).toBe(true);
  });

  it('estimates tokens as a quarter of the characters, rounded up', () => {
    const [chunk] = chunkMarkdown('abcdefghij');

    expect(chunk?.tokenCount).toBe(3);
    expect(estimateTokens('')).toBe(0);
  });

  it('returns nothing for empty input', () => {
    expect(chunkMarkdown('')).toEqual([]);
    expect(chunkMarkdown('\n\n  \n')).toEqual([]);
  });
});
