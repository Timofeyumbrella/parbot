import { describe, expect, it } from 'vitest';

import {
  codeLanguage,
  type HastRoot,
  hastText,
  rehypeCitations,
  rehypeStreamingCaret,
  rehypeStripCitations,
  splitCitations,
  stripCitationMarkers,
} from './markdown';

const paragraph = (text: string) => ({
  type: 'element' as const,
  tagName: 'p',
  properties: {},
  children: [{ type: 'text' as const, value: text }],
});

describe('splitCitations', () => {
  it('turns markers into sup elements and keeps the surrounding text', () => {
    const nodes = splitCitations('Rotate it in Settings [1]. Verify the signature [2, 3].', 3);

    expect(
      nodes.map((node) =>
        'value' in node
          ? node.value
          : `#${(node as unknown as { properties: { dataCitation: string } }).properties.dataCitation}`,
      ),
    ).toEqual(['Rotate it in Settings ', '#1', '. Verify the signature ', '#2', '#3', '.']);
  });

  it('leaves markers that cite nothing untouched', () => {
    expect(splitCitations('See [4] and [1]', 2)).toEqual([
      { type: 'text', value: 'See [4] and ' },
      expect.objectContaining({ tagName: 'sup' }),
    ]);
  });
});

describe('rehypeCitations', () => {
  it('skips code and links', () => {
    const tree: HastRoot = {
      type: 'root',
      children: [
        paragraph('Use the key [1]'),
        {
          type: 'element',
          tagName: 'pre',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: {},
              children: [{ type: 'text', value: 'x[1]' }],
            },
          ],
        },
      ],
    };

    rehypeCitations({ max: 1 })(tree);

    const first = tree.children[0] as { children: { type: string; value?: string }[] };
    expect(first.children.map((node) => node.type)).toEqual(['text', 'element']);
    expect(hastText(tree.children[1])).toBe('x[1]');
  });
});

describe('stripCitationMarkers', () => {
  it('takes markers out with the space before them', () => {
    expect(stripCitationMarkers('Rotate it in Settings [1]. Verify it [2, 3].', false)).toBe(
      'Rotate it in Settings. Verify it.',
    );
  });

  it('also drops a marker a stop cut in half, but only at the very end', () => {
    expect(stripCitationMarkers('Rotate it in Settings [1', true)).toBe('Rotate it in Settings');
    expect(stripCitationMarkers('Rotate it in Settings [', true)).toBe('Rotate it in Settings');
    expect(stripCitationMarkers('An array [1', false)).toBe('An array [1');
  });
});

describe('rehypeStripCitations', () => {
  it('strips markers from prose and leaves code alone', () => {
    const tree: HastRoot = {
      type: 'root',
      children: [
        paragraph('Keys live in Settings [1]. Rotate them [2].'),
        { type: 'text', value: '\n' },
        {
          type: 'element',
          tagName: 'pre',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: {},
              children: [{ type: 'text', value: 'keys[1]' }],
            },
          ],
        },
        { type: 'text', value: '\n' },
        paragraph('Webhooks are signed [3'),
        { type: 'text', value: '\n' },
      ],
    };

    rehypeStripCitations()(tree);

    expect(hastText(tree)).toBe(
      'Keys live in Settings. Rotate them.\nkeys[1]\nWebhooks are signed\n',
    );
  });
});

describe('rehypeStreamingCaret', () => {
  it('adds the caret class to the innermost last element', () => {
    const tree: HastRoot = {
      type: 'root',
      children: [
        paragraph('first'),
        {
          type: 'element',
          tagName: 'ul',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'li',
              properties: { className: ['x'] },
              children: [{ type: 'text', value: 'last' }],
            },
          ],
        },
      ],
    };

    rehypeStreamingCaret()(tree);

    const list = tree.children[1] as unknown as {
      children: { properties: { className: string[] } }[];
    };
    expect(list.children[0].properties.className).toEqual(['x', 'streaming-caret']);
    expect(
      (tree.children[0] as { properties: Record<string, unknown> }).properties.className,
    ).toBeUndefined();
  });

  it('does nothing on an empty tree', () => {
    const tree: HastRoot = { type: 'root', children: [] };

    rehypeStreamingCaret()(tree);

    expect(tree.children).toEqual([]);
  });
});

describe('codeLanguage', () => {
  it('reads the language class in either shape', () => {
    expect(codeLanguage(['hljs', 'language-ts'])).toBe('ts');
    expect(codeLanguage('language-bash hljs')).toBe('bash');
    expect(codeLanguage(undefined)).toBeNull();
    expect(codeLanguage('hljs')).toBeNull();
  });
});
