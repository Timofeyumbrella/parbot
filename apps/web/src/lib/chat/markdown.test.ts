import { describe, expect, it } from 'vitest';

import { codeLanguage, type HastRoot, hastText, rehypeCitations, rehypeStreamingCaret, splitCitations } from './markdown';

const paragraph = (text: string) => ({
  type: 'element' as const,
  tagName: 'p',
  properties: {},
  children: [{ type: 'text' as const, value: text }],
});

describe('splitCitations', () => {
  it('turns markers into sup elements and keeps the surrounding text', () => {
    const nodes = splitCitations('Rotate it in Settings [1]. Verify the signature [2, 3].', 3);

    expect(nodes.map((node) => (node.type === 'text' ? node.value : `#${(node as { properties: { dataCitation: string } }).properties.dataCitation}`))).toEqual([
      'Rotate it in Settings ',
      '#1',
      '. Verify the signature ',
      '#2',
      '#3',
      '.',
    ]);
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
        { type: 'element', tagName: 'pre', properties: {}, children: [{ type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: 'x[1]' }] }] },
      ],
    };

    rehypeCitations({ max: 1 })(tree);

    const first = tree.children[0] as { children: { type: string; value?: string }[] };
    expect(first.children.map((node) => node.type)).toEqual(['text', 'element']);
    expect(hastText(tree.children[1])).toBe('x[1]');
  });
});

describe('rehypeStreamingCaret', () => {
  it('adds the caret class to the innermost last element', () => {
    const tree: HastRoot = {
      type: 'root',
      children: [
        paragraph('first'),
        { type: 'element', tagName: 'ul', properties: {}, children: [{ type: 'element', tagName: 'li', properties: { className: ['x'] }, children: [{ type: 'text', value: 'last' }] }] },
      ],
    };

    rehypeStreamingCaret()(tree);

    const list = tree.children[1] as { children: { properties: { className: string[] } }[] };
    expect(list.children[0].properties.className).toEqual(['x', 'streaming-caret']);
    expect((tree.children[0] as { properties: Record<string, unknown> }).properties.className).toBeUndefined();
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
