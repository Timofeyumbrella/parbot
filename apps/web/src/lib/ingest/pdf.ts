/**
 * Rebuilds the reading structure of a PDF from the text runs pdf.js reports, as Markdown: lines
 * from end-of-line marks and baseline changes, paragraphs from vertical gaps and first-line
 * indents, headings from short lines set noticeably larger than the body text, lists from their
 * markers and code from fixed-width fonts. A PDF then chunks and reads like the same document
 * uploaded as Word or Markdown. Pure: pdf.js itself stays in extract.ts.
 */

export type PdfRun = {
  text: string;
  /** The left end of the run's baseline, in PDF units from the page's bottom-left corner. */
  x: number;
  y: number;
  width: number;
  /** The font size in PDF units. */
  size: number;
  /** Set in a fixed-width font. */
  monospace: boolean;
  /** pdf.js saw a line break after this run. */
  eol: boolean;
  /** Written left to right along the page. Rotated text has no usable line geometry. */
  upright: boolean;
};

type Line = {
  text: string;
  page: number;
  /** Left edge, right edge and baseline of the line. */
  x: number;
  right: number;
  y: number;
  /** The size most of its characters are set in. */
  size: number;
  monospace: boolean;
  /** Its first and last words are set in a fixed-width font: code, where hyphens are real. */
  startsMono: boolean;
  endsMono: boolean;
  upright: boolean;
};

type Marker = { marker: string; text: string; glyph: boolean };

type Block =
  | { kind: 'text'; lines: Line[]; size: number }
  | { kind: 'item'; lines: Line[]; size: number; marker: string; markerX: number }
  | { kind: 'code'; lines: Line[]; size: number; gaps: number[] };

/** A run further than this share of the font size from the one before it is a new word. */
const WORD_GAP = 0.25;
/** A baseline further than this share of the font size from the line's own starts a new line. */
const BASELINE_SHIFT = 0.6;
/** Sizes within this share of each other are the same text style. */
const SAME_SIZE = 0.08;
/** A line this much larger than the body text, and at least a point larger, may be a heading. */
const HEADING_SCALE = 1.12;
const HEADING_MAX_CHARS = 150;
const HEADING_MAX_LINES = 3;
/** Heading sizes within this share of each other are one heading level. */
const HEADING_LEVEL_STEP = 0.93;
/** Baseline-to-baseline distance as a share of the font size, when the file gives nothing better. */
const DEFAULT_LINE_RATIO = 1.2;
/** A gap this much wider than the usual distance between lines ends a paragraph. */
const PARAGRAPH_GAP = 1.3;
/** A share of lines this large in a fixed-width font makes a line code. */
const CODE_SHARE = 0.8;

const PAGE_NUMBER = /^(?:page\s+)?[-–—]?\s*\d{1,4}\s*[-–—]?(?:\s*(?:of|\/)\s*\d{1,4})?$/i;
const GLYPH_BULLET = /^([•◦▪▫‣⁃●○■□◆◇►▶➢✓✔·\uF0A7\uF0B7\uF0D8\uF0FC])\s*(\S.*)$/u;
const ASCII_BULLET = /^([-*+])\s+(\S.*)$/;
const ORDERED = /^(\d{1,3})[.)]\s+(\S.*)$/;
const ENDS_SENTENCE = /[.!?:;]["'”’)\]]*$/;

const sameSize = (a: number, b: number) => Math.abs(a - b) <= SAME_SIZE * Math.max(a, b);

/** Control characters and odd spaces out; soft hyphens kept only where a line ends. */
const cleanRunText = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F\u200B\uFEFF]/g, '')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000\t]/g, ' ');

type LineDraft = {
  parts: string[];
  x: number;
  right: number;
  y: number;
  size: number;
  lastRight: number;
  lastSize: number;
  space: boolean;
  /** Characters per size, fixed-width ones apart: inline code is often set a size smaller. */
  bySize: Map<number, number>;
  monoBySize: Map<number, number>;
  monoChars: number;
  chars: number;
  startsMono: boolean;
  endsMono: boolean;
  upright: boolean;
};

const finishLine = (draft: LineDraft, page: number): Line | null => {
  const text = draft.parts
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\u00AD(?!$)/g, '');

  if (!text) {
    return null;
  }

  let size = draft.size;
  let most = 0;

  for (const [candidate, count] of draft.bySize.size ? draft.bySize : draft.monoBySize) {
    if (count > most) {
      most = count;
      size = candidate;
    }
  }

  return {
    text,
    page,
    x: draft.x,
    right: draft.right,
    y: draft.y,
    size,
    monospace: draft.chars > 0 && draft.monoChars >= CODE_SHARE * draft.chars,
    startsMono: draft.startsMono,
    endsMono: draft.endsMono,
    upright: draft.upright,
  };
};

/** Half-point buckets, so a heading at 17.9 and one at 18 count as one size. */
const bucket = (size: number) => Math.round(size * 2) / 2;

/**
 * Joins a page's runs into lines, in the order the file draws them: that order follows the text
 * through columns, where sorting by position would weave neighbouring columns together.
 */
const pageLines = (runs: PdfRun[], page: number): Line[] => {
  const lines: Line[] = [];
  let draft: LineDraft | null = null;

  const close = () => {
    const line = draft ? finishLine(draft, page) : null;

    if (line) {
      lines.push(line);
    }

    draft = null;
  };

  for (const run of runs) {
    const text = cleanRunText(run.text);

    if (text.trim() === '') {
      if (draft && text) {
        draft.space = true;
      }
    } else {
      const current: LineDraft | null = draft;

      if (
        current &&
        current.upright &&
        run.upright &&
        Math.abs(run.y - current.y) > BASELINE_SHIFT * Math.max(run.size, current.size)
      ) {
        close();
      }

      if (!draft) {
        draft = {
          parts: [],
          x: run.x,
          right: run.x + run.width,
          y: run.y,
          size: run.size,
          lastRight: run.x,
          lastSize: run.size,
          space: false,
          bySize: new Map(),
          monoBySize: new Map(),
          monoChars: 0,
          chars: 0,
          startsMono: run.monospace,
          endsMono: run.monospace,
          upright: run.upright,
        };
      }

      const line: LineDraft = draft;
      const gap = run.x - line.lastRight;
      const wordBreak =
        line.parts.length > 0 &&
        (line.space || (run.upright && gap > WORD_GAP * Math.min(run.size, line.lastSize))) &&
        !/\s$/.test(line.parts[line.parts.length - 1]!) &&
        !/^\s/.test(text);

      if (wordBreak) {
        line.parts.push(' ');
      }

      const chars = text.replace(/\s/g, '').length;

      line.parts.push(text);
      line.space = false;
      line.x = Math.min(line.x, run.x);
      line.right = Math.max(line.right, run.x + run.width);
      line.lastRight = run.x + run.width;
      line.lastSize = run.size;
      const sizes = run.monospace ? line.monoBySize : line.bySize;

      if (chars > 0) {
        sizes.set(bucket(run.size), (sizes.get(bucket(run.size)) ?? 0) + chars);
      }

      line.chars += chars;
      line.monoChars += run.monospace ? chars : 0;
      line.endsMono = run.monospace;
      line.upright &&= run.upright;
    }

    if (run.eol) {
      close();
    }
  }

  close();

  return lines;
};

/** Page numbers, and running headers and footers repeated at the edge of most pages, go. */
const dropPageFurniture = (pages: Line[][], bodySize: number) => {
  const edges = pages.map((lines) => {
    const upright = lines.filter((line) => line.upright);

    if (upright.length < 2) {
      return new Set<Line>();
    }

    const top = upright.reduce((a, b) => (b.y > a.y ? b : a));
    const bottom = upright.reduce((a, b) => (b.y < a.y ? b : a));

    // Furniture is set no larger than the text it frames; a title at the top of page one stays.
    return new Set([top, bottom].filter((line) => line.size <= bodySize * (1 + SAME_SIZE)));
  });
  const key = (line: Line) => line.text.toLowerCase().replace(/\d+/g, '#');
  const pagesWith = new Map<string, number>();

  for (const edge of edges) {
    for (const text of new Set([...edge].map(key))) {
      pagesWith.set(text, (pagesWith.get(text) ?? 0) + 1);
    }
  }

  const repeatedOn = Math.max(3, Math.ceil(pages.length / 2));

  return pages.map((lines, index) =>
    lines.filter((line) => {
      if (!edges[index]!.has(line)) {
        return true;
      }

      return !PAGE_NUMBER.test(line.text) && (pagesWith.get(key(line)) ?? 0) < repeatedOn;
    }),
  );
};

/** The size most of the document's text is set in. */
const bodySizeOf = (lines: Line[]) => {
  const bySize = new Map<number, number>();

  for (const line of lines) {
    bySize.set(line.size, (bySize.get(line.size) ?? 0) + line.text.length);
  }

  let body = lines[0]?.size ?? 0;
  let most = 0;

  for (const [size, count] of bySize) {
    if (count > most) {
      most = count;
      body = size;
    }
  }

  return body;
};

/**
 * The usual distance between the baselines of body text, as a share of its size. The lower
 * quartile of the gaps between neighbouring body lines is the line spacing even when most lines
 * are one-line paragraphs; the cap keeps a document made only of those from reading as one block.
 */
const lineRatioOf = (pages: Line[][], bodySize: number) => {
  const ratios: number[] = [];

  for (const lines of pages) {
    for (let index = 1; index < lines.length; index += 1) {
      const a = lines[index - 1]!;
      const b = lines[index]!;
      const gap = a.y - b.y;

      if (
        a.upright &&
        b.upright &&
        sameSize(a.size, bodySize) &&
        sameSize(b.size, bodySize) &&
        gap > 0.5 * bodySize &&
        gap < 3 * bodySize
      ) {
        ratios.push(gap / bodySize);
      }
    }
  }

  if (ratios.length === 0) {
    return DEFAULT_LINE_RATIO;
  }

  ratios.sort((a, b) => a - b);

  return Math.min(Math.max(ratios[Math.floor(ratios.length / 4)]!, 0.9), 1.4);
};

const listMarker = (text: string): Marker | null => {
  const glyph = text.match(GLYPH_BULLET);

  if (glyph) {
    return { marker: '-', text: glyph[2]!, glyph: true };
  }

  const ascii = text.match(ASCII_BULLET);

  if (ascii) {
    return { marker: '-', text: ascii[2]!, glyph: false };
  }

  const ordered = text.match(ORDERED);

  return ordered ? { marker: `${Number(ordered[1])}.`, text: ordered[2]!, glyph: false } : null;
};

/**
 * A block's lines as one paragraph, the lines meeting at a space. A lower-case word hyphenated
 * across two lines is joined again ("infor-" / "mation"); a hyphen before a capital or a digit
 * ("Wi-" / "Fi", "COVID-" / "19") or inside code ("data-" / "mode") belongs to the word and stays.
 */
const joinLines = (lines: Pick<Line, 'text' | 'startsMono' | 'endsMono'>[]) => {
  let joined = '';
  let before: Pick<Line, 'endsMono'> | null = null;

  for (const line of lines) {
    const next = line.text;

    if (!before) {
      joined = next;
    } else if (joined.endsWith('\u00AD')) {
      joined = joined.slice(0, -1) + next;
    } else if (/[\p{L}\p{N}]-$/u.test(joined) && /^[\p{L}\p{N}]/u.test(next)) {
      const hyphenated =
        /\p{Ll}-$/u.test(joined) && /^\p{Ll}/u.test(next) && !before.endsMono && !line.startsMono;

      joined = hyphenated ? joined.slice(0, -1) + next : joined + next;
    } else {
      joined = `${joined} ${next}`;
    }

    before = line;
  }

  return joined.replace(/\u00AD/g, '');
};

const blockText = (block: Block) => joinLines(block.lines);

const itemText = (block: Extract<Block, { kind: 'item' }>) => {
  const [first, ...rest] = block.lines;

  return joinLines([{ ...first!, text: listMarker(first!.text)?.text ?? first!.text }, ...rest]);
};

/** Text that Markdown would read as syntax at the start of a paragraph or item is escaped. */
const escapeParagraph = (text: string) => {
  if (/^(?:[#>|]|[-*+](?:\s|$)|`{3}|~{3}|[-_*=]{3,}\s*$)/.test(text)) {
    return `\\${text}`;
  }

  return text.replace(/^(\d{1,9})([.)])(?=\s|$)/, '$1\\$2');
};

const isHeading = (block: Block, bodySize: number) => {
  if (block.kind !== 'text' || block.lines.length > HEADING_MAX_LINES) {
    return false;
  }

  const text = blockText(block);

  return (
    block.size >= bodySize * HEADING_SCALE &&
    block.size - bodySize >= 1 &&
    block.lines.every((line) => line.upright) &&
    text.length <= HEADING_MAX_CHARS &&
    !/[.,;]$/.test(text) &&
    (text.match(/\p{L}/gu)?.length ?? 0) >= 2
  );
};

const renderCode = (block: Extract<Block, { kind: 'code' }>) => {
  const left = block.lines.reduce((min, line) => Math.min(min, line.x), Number.POSITIVE_INFINITY);
  const widths = block.lines
    .map((line) => (line.right - line.x) / line.text.length)
    .filter((width) => width > 0)
    .sort((a, b) => a - b);
  const charWidth = widths[Math.floor(widths.length / 2)] ?? block.size * 0.6;
  const lines: string[] = [];

  block.lines.forEach((line, index) => {
    if (index > 0 && block.gaps[index]! > 1.8 * line.size) {
      lines.push('');
    }

    lines.push(' '.repeat(Math.max(Math.round((line.x - left) / charWidth), 0)) + line.text);
  });

  const body = lines.join('\n');
  const longest = (body.match(/`{3,}/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, longest + 1));

  return `${fence}\n${body}\n${fence}`;
};

/**
 * Turns the text runs of each page, in the order pdf.js reports them, into Markdown with the
 * document's headings, paragraphs, lists and code blocks.
 */
export const pdfRunsToMarkdown = (runsByPage: PdfRun[][]): string => {
  const drawn = runsByPage.map((runs, page) => pageLines(runs, page));
  const upright = drawn.flat().filter((line) => line.upright);
  const bodySize = bodySizeOf(upright.length ? upright : drawn.flat());
  const pages = dropPageFurniture(drawn, bodySize);
  const lineRatio = lineRatioOf(pages, bodySize);
  const bodyLines = pages.flat().filter((line) => sameSize(line.size, bodySize));
  // A document typed entirely in a fixed-width font has no code to tell apart.
  const codeFont =
    bodyLines.filter((line) => line.monospace).length < Math.max(bodyLines.length / 2, 1);

  const pageOf = new Map(pages.flatMap((lines) => lines.map((line) => [line, lines] as const)));
  const columnRights = new Map<Line, number>();

  /**
   * Where the text column that `line` sits in ends: where most of the lines of its size that
   * share its stretch of the page end. A high percentile, not the maximum, so one wide table
   * row does not move it.
   */
  const columnRight = (line: Line) => {
    const known = columnRights.get(line);

    if (known !== undefined) {
      return known;
    }

    const ends = (pageOf.get(line) ?? [line])
      .filter(
        (other) =>
          other.upright &&
          !other.monospace &&
          sameSize(other.size, line.size) &&
          other.x < line.right &&
          line.x < other.right,
      )
      .map((other) => other.right)
      .sort((a, b) => a - b);
    const right = ends[Math.ceil((ends.length - 1) * 0.8)] ?? line.right;

    columnRights.set(line, right);

    return right;
  };

  /**
   * A line that stopped although the next line's first word would have fitted on it was broken
   * on purpose: a list whose bullets are drawn as shapes, or lines kept apart without a gap. The
   * slack of two letters' height covers words the file glued to the next one ("25 MB").
   */
  const brokenEarly = (prev: Line, line: Line) => {
    // A hyphen at the end is a wrap by definition; a lower-case start continues a sentence.
    if (/-$/.test(prev.text) || !/^[\p{Lu}\p{N}"“'‘(]/u.test(line.text)) {
      return false;
    }

    const charWidth = (line.right - line.x) / line.text.length;
    const firstWord = line.text.split(' ')[0]!;

    return columnRight(prev) - prev.right > (firstWord.length + 1) * charWidth + 2 * line.size;
  };

  const blocks: Block[] = [];
  // Widened on purpose: `start` assigns it from a closure, which narrowing cannot see.
  let block = null as Block | null;
  let previous: Line | null = null;

  const start = (next: Block) => {
    blocks.push(next);
    block = next;
  };

  for (const line of pages.flat()) {
    const prev = previous;
    const current = block;

    previous = line;

    // A new page, a jump back up to the next column, or rotated text interrupts the flow.
    const flowBreak =
      !prev ||
      line.page !== prev.page ||
      !line.upright ||
      !prev.upright ||
      line.y > prev.y + 0.5 * line.size;
    const gap = prev && !flowBreak ? prev.y - line.y : Number.POSITIVE_INFINITY;
    const size = Math.max(line.size, prev?.size ?? 0);
    const paragraphGap = gap > size * lineRatio * PARAGRAPH_GAP;
    const headingSized = line.size >= bodySize * HEADING_SCALE && line.size - bodySize >= 1;
    // A paragraph that runs on over a page or column break: the sentence has not ended.
    const runsOn =
      current !== null &&
      current.kind !== 'code' &&
      prev !== null &&
      sameSize(line.size, current.size) &&
      !ENDS_SENTENCE.test(prev.text) &&
      (/^\p{Ll}/u.test(line.text) || /(?:\p{Ll}-|\u00AD)$/u.test(prev.text)) &&
      line.upright &&
      prev.upright;
    const continues = flowBreak ? runsOn : !paragraphGap;

    if (codeFont && line.monospace && !headingSized) {
      if (current?.kind === 'code' && !flowBreak && gap <= 3 * line.size) {
        current.lines.push(line);
        current.gaps.push(gap);
        continue;
      }

      // Inline code that wrapped onto a line of its own stays in its paragraph or list item.
      const wrapped =
        continues &&
        (current?.kind === 'text' || current?.kind === 'item') &&
        current.size < bodySize * HEADING_SCALE;

      if (wrapped) {
        current.lines.push(line);
      } else {
        start({ kind: 'code', lines: [line], size: line.size, gaps: [0] });
      }

      continue;
    }

    const marker = headingSized ? null : listMarker(line.text);
    // An ASCII marker can also begin a wrapped line ("see step" / "3. Then"), so it opens an item
    // only where a new block could begin anyway.
    const markerStartsItem =
      marker !== null &&
      (marker.glyph ||
        !current ||
        !continues ||
        !sameSize(line.size, current.size) ||
        current.kind === 'item' ||
        (prev !== null && ENDS_SENTENCE.test(prev.text)));

    if (markerStartsItem) {
      start({
        kind: 'item',
        lines: [line],
        size: line.size,
        marker: marker.marker,
        markerX: line.x,
      });
      continue;
    }

    const broken = !flowBreak && prev !== null && brokenEarly(prev, line);

    if (current?.kind === 'item') {
      const hangs = line.x > current.markerX + 0.3 * line.size;

      if (continues && !broken && sameSize(line.size, current.size) && (hangs || flowBreak)) {
        current.lines.push(line);
        continue;
      }
    }

    if (current?.kind === 'text' && continues && !broken && sameSize(line.size, current.size)) {
      const left = current.lines.reduce((min, drawnLine) => Math.min(min, drawnLine.x), line.x);
      // First-line indents mark paragraphs in documents that leave no gap between them.
      const indented =
        !flowBreak &&
        current.lines.length > 1 &&
        prev !== null &&
        prev.x <= left + 0.5 * line.size &&
        line.x > prev.x + 0.8 * line.size &&
        line.x < prev.x + 8 * line.size;

      if (!indented) {
        current.lines.push(line);
        continue;
      }
    }

    start({ kind: 'text', lines: [line], size: line.size });
  }

  const headingSizes = [
    ...new Set(blocks.filter((each) => isHeading(each, bodySize)).map((each) => each.size)),
  ].sort((a, b) => b - a);
  const levels = new Map<number, number>();
  let level = 0;
  let levelTop = Number.POSITIVE_INFINITY;

  for (const headingSize of headingSizes) {
    if (headingSize < levelTop * HEADING_LEVEL_STEP) {
      level += 1;
      levelTop = headingSize;
    }

    levels.set(headingSize, Math.min(level, 4));
  }

  let markdown = '';
  let lists: { x: number; width: number }[] = [];

  for (const each of blocks) {
    if (each.kind === 'item') {
      const tolerance = 0.5 * each.size;
      // Items of one list sit on consecutive lines; anything else is set off by a blank line.
      const separator = markdown ? (lists.length > 0 ? '\n' : '\n\n') : '';

      while (lists.length && lists[lists.length - 1]!.x > each.markerX + tolerance) {
        lists.pop();
      }

      const top = lists[lists.length - 1];

      if (top && Math.abs(top.x - each.markerX) <= tolerance) {
        lists[lists.length - 1] = { x: each.markerX, width: each.marker.length + 1 };
      } else {
        lists.push({ x: each.markerX, width: each.marker.length + 1 });
      }

      const indent = lists
        .slice(0, -1)
        .map((list) => ' '.repeat(list.width))
        .join('');

      markdown += `${separator}${indent}${each.marker} ${escapeParagraph(itemText(each))}`;
      continue;
    }

    lists = [];

    const rendered =
      each.kind === 'code'
        ? renderCode(each)
        : isHeading(each, bodySize)
          ? `${'#'.repeat(levels.get(each.size) ?? 1)} ${blockText(each)}`
          : escapeParagraph(blockText(each));

    markdown += `${markdown ? '\n\n' : ''}${rendered}`;
  }

  return markdown;
};
