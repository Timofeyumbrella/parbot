/**
 * Markdown-aware chunking. Sections follow the heading structure, paragraphs are packed to a
 * target size with a little overlap for context, and fenced code blocks are never cut mid-block.
 * Pure: no I/O, so it is cheap to test exhaustively.
 */

export type Chunk = {
  /** Heading path such as "Guide › Authentication › API keys"; null before the first heading. */
  heading: string | null;
  content: string;
  tokenCount: number;
};

export type ChunkOptions = {
  /** Characters a chunk aims for. */
  target?: number;
  /** Characters carried over from the end of the previous chunk, cut at a word boundary. */
  overlap?: number;
  /** A fenced code block longer than this is cut at line boundaries. */
  maxCodeChars?: number;
};

export const CHUNK_TARGET = 1200;
export const CHUNK_OVERLAP = 150;
export const MAX_CODE_CHARS = 4000;
export const HEADING_SEPARATOR = ' › ';

/** The rough four-characters-per-token rule the rest of the app uses. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'code'; fence: string; info: string; lines: string[] };

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}(#{1,4})[ \t]+(.+?)[ \t]*#*[ \t]*$/;

const renderCode = (fence: string, info: string, lines: string[]) =>
  `${fence}${info}\n${lines.join('\n')}\n${fence}`;

/** Splits Markdown into headings, paragraphs and fenced code blocks, in document order. */
export const parseBlocks = (markdown: string): Block[] => {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let code: { fence: string; info: string; lines: string[] } | null = null;

  const flushParagraph = () => {
    const text = paragraph.join('\n').trim();

    if (text) {
      blocks.push({ kind: 'paragraph', text });
    }

    paragraph = [];
  };

  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (code) {
      const closing = line.match(FENCE);
      const closes =
        closing &&
        closing[1]![0] === code.fence[0] &&
        closing[1]!.length >= code.fence.length &&
        closing[2]!.trim() === '';

      if (closes) {
        blocks.push({ kind: 'code', ...code });
        code = null;
      } else {
        code.lines.push(line);
      }

      continue;
    }

    const opening = line.match(FENCE);

    if (opening) {
      flushParagraph();
      code = { fence: opening[1]!, info: opening[2]!.trim(), lines: [] };
      continue;
    }

    const heading = line.match(HEADING);

    if (heading) {
      flushParagraph();
      blocks.push({ kind: 'heading', level: heading[1]!.length, text: heading[2]!.trim() });
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    paragraph.push(line);
  }

  if (code) {
    // An unterminated fence runs to the end of the document. Keep it as code rather than prose.
    blocks.push({ kind: 'code', ...code });
  }

  flushParagraph();

  return blocks;
};

type Splitter = { pattern: RegExp; joiner: string };

/** Lines first, then sentences, then words: each level keeps as much structure as it can. */
const SPLITTERS: Splitter[] = [
  { pattern: /\n/, joiner: '\n' },
  { pattern: /(?<=[.!?…])\s+/, joiner: ' ' },
  { pattern: /\s+/, joiner: ' ' },
];

const hardCut = (text: string, limit: number) => {
  const pieces: string[] = [];

  for (let index = 0; index < text.length; index += limit) {
    pieces.push(text.slice(index, index + limit));
  }

  return pieces;
};

const packUnits = (units: string[], joiner: string, limit: number) => {
  const pieces: string[] = [];
  let current = '';

  for (const unit of units) {
    if (!unit) {
      continue;
    }

    if (!current) {
      current = unit;
    } else if (current.length + joiner.length + unit.length <= limit) {
      current += joiner + unit;
    } else {
      pieces.push(current);
      current = unit;
    }
  }

  if (current) {
    pieces.push(current);
  }

  return pieces;
};

const splitByLevel = (text: string, limit: number, level: number): string[] => {
  if (text.length <= limit) {
    return [text];
  }

  const splitter = SPLITTERS[level];

  if (!splitter) {
    return hardCut(text, limit);
  }

  const units = text
    .split(splitter.pattern)
    .flatMap((unit) => splitByLevel(unit.trim(), limit, level + 1));

  return packUnits(units, splitter.joiner, limit);
};

/** Splits a paragraph that is longer than `limit` at sentence boundaries where it can. */
export const splitParagraph = (text: string, limit: number): string[] =>
  splitByLevel(text, limit, 0).filter((piece) => piece.trim().length > 0);

/** Cuts an oversized code block at line boundaries; each piece is re-fenced so it stays valid. */
export const splitCodeBlock = (
  block: { fence: string; info: string; lines: string[] },
  maxChars: number,
): string[] => {
  const whole = renderCode(block.fence, block.info, block.lines);

  if (whole.length <= maxChars) {
    return [whole];
  }

  const overhead = block.fence.length * 2 + block.info.length + 2;
  const budget = Math.max(maxChars - overhead, 80);
  const lines = block.lines.flatMap((line) => (line.length > budget ? hardCut(line, budget) : [line]));
  const pieces: string[][] = [];
  let current: string[] = [];
  let length = 0;

  for (const line of lines) {
    const extra = current.length ? line.length + 1 : line.length;

    if (current.length && length + extra > budget) {
      pieces.push(current);
      current = [];
      length = 0;
    }

    current.push(line);
    length += current.length > 1 ? line.length + 1 : line.length;
  }

  if (current.length) {
    pieces.push(current);
  }

  return pieces.map((piece) => renderCode(block.fence, block.info, piece));
};

/** The last `overlap` characters of `text`, trimmed forward to the next word boundary. */
export const overlapTail = (text: string, overlap: number) => {
  if (overlap <= 0 || text.length <= overlap) {
    return '';
  }

  const start = text.length - overlap;

  if (/\s/.test(text[start - 1]!)) {
    return text.slice(start).trim();
  }

  const tail = text.slice(start);
  const boundary = tail.search(/\s/);

  return boundary === -1 ? '' : tail.slice(boundary + 1).trim();
};

type Unit = { text: string; kind: 'paragraph' | 'code'; continuation: boolean };

export const chunkMarkdown = (markdown: string, options: ChunkOptions = {}): Chunk[] => {
  const target = options.target ?? CHUNK_TARGET;
  const overlap = options.overlap ?? CHUNK_OVERLAP;
  const maxCodeChars = options.maxCodeChars ?? MAX_CODE_CHARS;
  // A paragraph piece leaves room for the overlap prefix so the packed chunk stays under target.
  const pieceLimit = Math.max(target - overlap - 2, Math.ceil(target / 2));

  const chunks: Chunk[] = [];
  const path: { level: number; text: string }[] = [];
  let heading: string | null = null;
  let prefix = '';
  let prefixJoiner = '\n\n';
  let parts: string[] = [];
  let length = 0;
  let lastKind: 'paragraph' | 'code' | null = null;
  let previous: { content: string; endsWithCode: boolean } | null = null;

  const flush = () => {
    const body = parts.join('\n\n').trim();
    const content = prefix && body ? `${prefix}${prefixJoiner}${body}` : body;

    if (content) {
      chunks.push({ heading, content, tokenCount: estimateTokens(content) });
      previous = { content, endsWithCode: lastKind === 'code' };
    }

    prefix = '';
    prefixJoiner = '\n\n';
    parts = [];
    length = 0;
  };

  const startWithOverlap = (unit: Unit) => {
    if (unit.kind === 'code' || !previous || previous.endsWithCode) {
      return;
    }

    const tail = overlapTail(previous.content, overlap);

    if (tail) {
      prefix = tail;
      prefixJoiner = unit.continuation ? ' ' : '\n\n';
      length = tail.length + prefixJoiner.length;
    }
  };

  const add = (unit: Unit) => {
    if (unit.text.length > target) {
      // Only code gets here; it stays whole in a chunk of its own.
      flush();
      parts = [unit.text];
      length = unit.text.length;
      lastKind = unit.kind;
      flush();

      return;
    }

    const extra = parts.length ? unit.text.length + 2 : unit.text.length;

    if (parts.length && length + extra > target) {
      flush();
    }

    if (parts.length === 0) {
      startWithOverlap(unit);
    }

    parts.push(unit.text);
    length += parts.length > 1 ? unit.text.length + 2 : unit.text.length;
    lastKind = unit.kind;
  };

  for (const block of parseBlocks(markdown)) {
    if (block.kind === 'heading') {
      flush();
      previous = null;

      while (path.length && path[path.length - 1]!.level >= block.level) {
        path.pop();
      }

      path.push({ level: block.level, text: block.text });
      heading = path.map((entry) => entry.text).join(HEADING_SEPARATOR);
      continue;
    }

    if (block.kind === 'code') {
      for (const text of splitCodeBlock(block, maxCodeChars)) {
        add({ text, kind: 'code', continuation: false });
      }

      continue;
    }

    splitParagraph(block.text, pieceLimit).forEach((text, index) => {
      add({ text, kind: 'paragraph', continuation: index > 0 });
    });
  }

  flush();

  return chunks;
};
