/**
 * Small hast transforms for answer rendering. Typed structurally so the app does not depend on
 * the hast packages that react-markdown pulls in.
 */

export type HastText = { type: 'text'; value: string };
export type HastElement = {
  type: 'element';
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
};
export type HastParent = { type: string; children: HastNode[] };
export type HastNode = HastText | HastElement | HastParent | { type: string };
export type HastRoot = { type: 'root'; children: HastNode[] };

const isElement = (node: HastNode): node is HastElement => node.type === 'element';
const isText = (node: HastNode): node is HastText => node.type === 'text';
const isParent = (node: HastNode): node is HastParent =>
  Array.isArray((node as Partial<HastParent>).children);

/** `[1]`, `[2, 3]`: the markers the engine asks the model for. */
export const CITATION_MARKER = /\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g;

const NO_CITATIONS_INSIDE = new Set(['code', 'pre', 'a', 'sup']);

const citationChip = (index: number): HastElement => ({
  type: 'element',
  tagName: 'sup',
  properties: { dataCitation: String(index) },
  children: [{ type: 'text', value: String(index) }],
});

/**
 * Splits `[n]` markers out of text nodes into `<sup data-citation="n">` elements, which the
 * message renders as chips. Markers above `max` are left alone: they cite nothing.
 */
export const splitCitations = (value: string, max: number): HastNode[] => {
  const nodes: HastNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(CITATION_MARKER)) {
    const indexes = match[1]!.split(',').map((part) => Number(part.trim()));

    if (indexes.some((index) => index < 1 || index > max)) {
      continue;
    }

    if (match.index > cursor) {
      nodes.push({ type: 'text', value: value.slice(cursor, match.index) });
    }

    for (const index of indexes) {
      nodes.push(citationChip(index));
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < value.length) {
    nodes.push({ type: 'text', value: value.slice(cursor) });
  }

  return nodes;
};

const walkCitations = (node: HastNode, max: number) => {
  if (!isParent(node)) {
    return;
  }

  if (isElement(node) && NO_CITATIONS_INSIDE.has(node.tagName)) {
    return;
  }

  node.children = node.children.flatMap((child) => {
    if (isText(child) && child.value.includes('[')) {
      return splitCitations(child.value, max);
    }

    walkCitations(child, max);

    return [child];
  });
};

export const rehypeCitations = (options: { max: number }) => (tree: HastRoot) => {
  if (options.max > 0) {
    walkCitations(tree, options.max);
  }
};

const lastElement = (node: HastNode): HastElement | null => {
  if (!isParent(node)) {
    return null;
  }

  for (let index = node.children.length - 1; index >= 0; index -= 1) {
    const child = node.children[index]!;

    if (isElement(child)) {
      return lastElement(child) ?? child;
    }
  }

  return null;
};

const CARET_CLASS = 'streaming-caret';

/** Puts the blinking caret on the innermost last element, so it sits right after the last text. */
export const rehypeStreamingCaret = () => (tree: HastRoot) => {
  const target = lastElement(tree);

  if (!target) {
    return;
  }

  const properties = target.properties ?? {};
  const existing = properties.className;
  const classes = Array.isArray(existing)
    ? existing
    : typeof existing === 'string'
      ? [existing]
      : [];

  target.properties = { ...properties, className: [...classes, CARET_CLASS] };
};

/** The text content of a hast subtree, for the copy button on code blocks. */
export const hastText = (node: HastNode | undefined): string => {
  if (!node) {
    return '';
  }

  if (isText(node)) {
    return node.value;
  }

  return isParent(node) ? node.children.map(hastText).join('') : '';
};

/** The `language-*` class react-markdown puts on fenced code. */
export const codeLanguage = (className: unknown): string | null => {
  const classes = Array.isArray(className)
    ? className.map(String)
    : typeof className === 'string'
      ? className.split(/\s+/)
      : [];
  const language = classes.find((name) => name.startsWith('language-'));

  return language ? language.slice('language-'.length) || null : null;
};
