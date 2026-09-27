import { type HastElement, type HastNode, type HastRoot, hastText } from '@/lib/chat/markdown';

/**
 * Finds a cited passage in a rendered page. A passage is a chunk of the page's Markdown, cut by
 * the chunker (with a little overlap from the chunk before it); the page is the same Markdown
 * rendered. Both sides are reduced to their words, so emphasis, links, list bullets and table
 * pipes compare equal, and the page's blocks that the passage contains are the ones marked.
 */

/** The id the first highlighted block carries, for scrolling to it. */
export const PASSAGE_ANCHOR = 'passage';

/** Blocks a passage is made of. Tables and code are taken whole: the chunker never splits a row. */
const BLOCK_TAGS = new Set(['p', 'li', 'pre', 'table', 'blockquote', 'dt', 'dd']);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const ATOMIC_TAGS = new Set(['pre', 'table']);

/** Letters and digits only, lower-cased and single-spaced. */
export const comparableText = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Markdown reduced to what a reader sees of it: links and images keep only their text. */
export const passageText = (markdown: string) =>
  comparableText(markdown.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1'));

/** How much of a passage's end is looked for inside one long block: a paragraph split in two. */
const PROBE_CHARS = 80;

/**
 * Below this, a block matching the passage proves little ("Note", a one-word list item, a
 * heading the passage happens to repeat): it is lit only between two blocks that prove more.
 */
const WEAK_CHARS = 20;

export type PassageBlock<T> = {
  text: string;
  item: T;
  /** Headings are never part of a passage (the chunker keeps them apart), only framed by one. */
  heading?: boolean;
};

/**
 * The blocks that make up the passage, in page order. A block matches when the passage contains
 * it, or, for a paragraph the chunker split, when it contains the passage's end. Short matches
 * and headings only join a run between longer matches, and only the longest run is kept, so a
 * line that happens to recur elsewhere is not lit up.
 */
export const matchPassage = <T>(blocks: PassageBlock<T>[], passage: string): T[] => {
  const target = passageText(passage);

  if (!target) {
    return [];
  }

  const probe = target.length > PROBE_CHARS ? target.slice(-PROBE_CHARS) : target;
  let best: { items: T[]; size: number } = { items: [], size: 0 };
  let run: { items: T[]; size: number } = { items: [], size: 0 };
  /** Weak matches after the run's last strong one; they join only if another strong one follows. */
  let pending: T[] = [];

  const close = () => {
    if (run.size > best.size) {
      best = run;
    }

    run = { items: [], size: 0 };
    pending = [];
  };

  for (const block of blocks) {
    const text = comparableText(block.text);

    if (!text) {
      continue;
    }

    const contained = target.includes(text);
    const hit = contained || text.includes(probe);
    const strong = hit && !block.heading && (text.length >= WEAK_CHARS || text === target);

    if (strong) {
      run = { items: [...run.items, ...pending, block.item], size: run.size + text.length };
      pending = [];
    } else if (hit) {
      // Weak: kept aside, and lit only if the passage goes on past it.
      if (run.items.length > 0) {
        pending.push(block.item);
      }
    } else {
      close();
    }
  }

  close();

  return best.items;
};

const isElement = (node: HastNode): node is HastElement => node.type === 'element';
const hasChildren = (node: HastNode): node is { type: string; children: HastNode[] } =>
  Array.isArray((node as { children?: unknown }).children);

/** Blocks with no block inside them (the paragraph in a list item), plus headings; tables whole. */
const leafBlocks = (node: HastNode): PassageBlock<HastElement>[] => {
  if (!hasChildren(node)) {
    return [];
  }

  if (isElement(node) && HEADING_TAGS.has(node.tagName)) {
    return [{ text: hastText(node), item: node, heading: true }];
  }

  if (isElement(node) && ATOMIC_TAGS.has(node.tagName)) {
    return [{ text: hastText(node), item: node }];
  }

  const nested = node.children.flatMap(leafBlocks);

  if (isElement(node) && BLOCK_TAGS.has(node.tagName) && nested.length === 0) {
    return [{ text: hastText(node), item: node }];
  }

  return nested;
};

/**
 * Marks the passage's blocks with `data-passage` and gives the first the PASSAGE_ANCHOR id, while
 * the page renders, so the highlight is in the first paint rather than added after it. Reports
 * whether anything matched through `onMatch`.
 */
export const rehypePassage =
  (options: { passage?: string | null; onMatch?: (matched: boolean) => void }) =>
  (tree: HastRoot) => {
    if (!options.passage) {
      return;
    }

    const marked = matchPassage(leafBlocks(tree), options.passage);

    marked.forEach((block, index) => {
      block.properties = {
        ...block.properties,
        dataPassage: 'true',
        ...(index === 0 ? { id: PASSAGE_ANCHOR } : {}),
      };
    });

    options.onMatch?.(marked.length > 0);
  };
