import { type HastElement, type HastNode, type HastRoot, hastText } from '@/lib/chat/markdown';

/**
 * Finds a cited passage in a rendered page. A passage is a chunk of the page's Markdown, cut by
 * the chunker (with a little overlap from the chunk before it); the page is the same Markdown
 * rendered. Both sides are reduced to their words, so emphasis, links, list bullets and table
 * pipes compare equal, and the page's blocks that the passage contains are the ones marked.
 */

/** The id the first highlighted block carries, for scrolling to it. */
export const PASSAGE_ANCHOR = 'passage';

const BLOCK_TAGS = new Set([
  'p',
  'li',
  'pre',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'td',
  'th',
  'dt',
  'dd',
]);

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
 * The blocks that make up the passage, in page order. Each block is either contained in the
 * passage or, for a paragraph the chunker split, contains the passage's end. Only the longest run
 * of neighbouring matches is kept, so a short line that happens to recur elsewhere is not lit up.
 */
export const matchPassage = <T>(blocks: { text: string; item: T }[], passage: string): T[] => {
  const target = passageText(passage);

  if (!target) {
    return [];
  }

  const probe = target.length > PROBE_CHARS ? target.slice(-PROBE_CHARS) : target;
  let best: { items: T[]; size: number } = { items: [], size: 0 };
  let run: { items: T[]; size: number } = { items: [], size: 0 };

  for (const block of blocks) {
    const text = comparableText(block.text);
    const hit = text.length > 0 && (target.includes(text) || text.includes(probe));

    if (hit) {
      run = { items: [...run.items, block.item], size: run.size + text.length };

      if (run.size > best.size) {
        best = run;
      }
    } else if (text.length > 0) {
      run = { items: [], size: 0 };
    }
  }

  return best.items;
};

const isElement = (node: HastNode): node is HastElement => node.type === 'element';
const hasChildren = (node: HastNode): node is { type: string; children: HastNode[] } =>
  Array.isArray((node as { children?: unknown }).children);

/** Blocks with no block inside them: the paragraph in a list item, not the item around it. */
const leafBlocks = (node: HastNode): HastElement[] => {
  if (!hasChildren(node)) {
    return [];
  }

  const nested = node.children.flatMap(leafBlocks);

  if (isElement(node) && BLOCK_TAGS.has(node.tagName) && nested.length === 0) {
    return [node];
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

    const marked = matchPassage(
      leafBlocks(tree).map((block) => ({ text: hastText(block), item: block })),
      options.passage,
    );

    marked.forEach((block, index) => {
      block.properties = {
        ...block.properties,
        dataPassage: 'true',
        ...(index === 0 ? { id: PASSAGE_ANCHOR } : {}),
      };
    });

    options.onMatch?.(marked.length > 0);
  };
