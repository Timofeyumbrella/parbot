/**
 * PDFs built by hand so tests need no binary fixture. `minimalPdf` is one line on one page;
 * `buildPdf` places lines of text where a test says, in the standard fonts; `layoutPdf` flows
 * headings, paragraphs and lists down pages the way a word processor would.
 */

export type PdfFont = 'regular' | 'bold' | 'mono';

/** A run of text drawn at (x, y), the baseline's left end, in points from the bottom-left corner. */
export type PdfLine = { text: string; x: number; y: number; size: number; font?: PdfFont };

export type PdfPageSize = { width: number; height: number };

const FONTS: Record<PdfFont, { resource: string; baseFont: string }> = {
  regular: { resource: 'F1', baseFont: 'Helvetica' },
  bold: { resource: 'F2', baseFont: 'Helvetica-Bold' },
  mono: { resource: 'F3', baseFont: 'Courier' },
};

/** WinAnsi codes for the few characters outside Latin-1 that documents use. */
const WIN_ANSI: Record<string, number> = {
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
};

/** A PDF string literal: delimiters escaped, anything beyond ASCII written as an octal code. */
const pdfString = (text: string) =>
  [...text]
    .map((char) => {
      if (char === '(' || char === ')' || char === '\\') {
        return `\\${char}`;
      }

      const code = WIN_ANSI[char] ?? char.charCodeAt(0);

      if (code > 0xff) {
        throw new Error(`The PDF fixture cannot draw ${JSON.stringify(char)}.`);
      }

      return code < 0x20 || code > 0x7e ? `\\${code.toString(8).padStart(3, '0')}` : char;
    })
    .join('');

/** Metadata is text, not glyphs: UTF-16 with a byte order mark, written as hex. */
const pdfTextString = (text: string) =>
  `<FEFF${text
    .split('')
    .map((char) => char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'))
    .join('')}>`;

const serialize = (objects: string[], infoIndex: number | null) => {
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xref = body.length;

  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (const offset of offsets) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  const infoRef = infoIndex === null ? '' : ` /Info ${infoIndex + 1} 0 R`;

  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${infoRef} >>\nstartxref\n${xref}\n%%EOF\n`;

  // Every character is ASCII, so the string's length is the file's byte length.
  return new TextEncoder().encode(body);
};

/**
 * A one-page PDF with a single line of text. Keep the text to letters, digits and spaces: it is
 * written into the stream as it is.
 */
export const minimalPdf = (text: string, title?: string) => {
  const info = title ? `<< /Title (${title}) >>` : null;
  const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...(info ? [info] : []),
  ];

  return serialize(objects, info ? objects.length - 1 : null);
};

export const LETTER: PdfPageSize = { width: 612, height: 792 };

/**
 * A PDF with every line drawn where the test puts it, one text object per line, in the order
 * given: the order a reader meets them in the file, which need not be top to bottom.
 */
export const buildPdf = (
  pages: PdfLine[][],
  options: { title?: string; page?: PdfPageSize } = {},
) => {
  const { width, height } = options.page ?? LETTER;
  const fontIds = Object.keys(FONTS) as PdfFont[];
  // 1 catalog, 2 pages, then the fonts, then a page object and its content stream per page.
  const fontObject = (font: PdfFont) => 3 + fontIds.indexOf(font);
  const firstPage = 3 + fontIds.length;
  const fontResources = fontIds
    .map((font) => `/${FONTS[font].resource} ${fontObject(font)} 0 R`)
    .join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${firstPage + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    ...fontIds.map(
      (font) =>
        `<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[font].baseFont} /Encoding /WinAnsiEncoding >>`,
    ),
  ];

  pages.forEach((lines, index) => {
    const stream = lines
      .map(
        (line) =>
          `BT /${FONTS[line.font ?? 'regular'].resource} ${line.size} Tf ${line.x} ${line.y} Td (${pdfString(line.text)}) Tj ET`,
      )
      .join('\n');

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents ${firstPage + index * 2 + 1} 0 R /Resources << /Font << ${fontResources} >> >> >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });

  const info = options.title ? `<< /Title ${pdfTextString(options.title)} >>` : null;

  if (info) {
    objects.push(info);
  }

  return serialize(objects, info ? objects.length - 1 : null);
};

export type PdfBlock =
  | { heading: string; level?: 1 | 2 | 3 }
  | { paragraph: string }
  /** A paragraph broken where the test says, to hyphenate a word or run over a page. */
  | { lines: string[] }
  | { bullets: string[] }
  | { steps: string[] }
  | { code: string[] }
  | { pageBreak: true };

export type LayoutOptions = {
  title?: string;
  /** Body text size; headings are drawn larger. */
  size?: number;
  /** Characters on a full line of body text. */
  columnChars?: number;
  /** Page numbers at the foot of every page, as most exported documents have. */
  pageNumbers?: boolean;
};

const HEADING_SCALE = { 1: 2, 2: 1.5, 3: 1.25 } as const;
const MARGIN = 72;

/** Greedy word wrap: a line never runs past `limit` characters unless one word does. */
export const wrapWords = (text: string, limit: number) => {
  const lines: string[] = [];
  let current = '';

  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (current && current.length + 1 + word.length > limit) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
};

/**
 * Lays blocks out on Letter pages: wrapped lines 1.3 times the text size apart, a gap of about
 * two thirds of a line between blocks, bullets and numbers hanging to the left of their text, and
 * a new page when the next line would cross the bottom margin.
 */
export const layoutPdf = (blocks: PdfBlock[], options: LayoutOptions = {}) => {
  const size = options.size ?? 11;
  const columnChars = options.columnChars ?? 80;
  const leading = Math.round(size * 1.3 * 10) / 10;
  const blockGap = Math.round(size * 0.7 * 10) / 10;
  const pages: PdfLine[][] = [[]];
  let y = LETTER.height - MARGIN;

  const place = (line: Omit<PdfLine, 'y'>, advance: number) => {
    if (y - advance < MARGIN) {
      pages.push([]);
      y = LETTER.height - MARGIN;
    }

    y -= advance;
    pages[pages.length - 1]!.push({ ...line, y: Math.round(y * 10) / 10 });
  };

  const newPage = () => {
    pages.push([]);
    y = LETTER.height - MARGIN;
  };

  let first = true;

  for (const block of blocks) {
    const gap = first ? 0 : blockGap;

    first = false;

    if ('pageBreak' in block) {
      newPage();
      first = true;
      continue;
    }

    if ('heading' in block) {
      const headingSize = size * HEADING_SCALE[block.level ?? 2];

      place(
        { text: block.heading, x: MARGIN, size: headingSize, font: 'bold' },
        headingSize * 1.3 + gap + size * 0.4,
      );
      continue;
    }

    if ('paragraph' in block || 'lines' in block) {
      const lines = 'lines' in block ? block.lines : wrapWords(block.paragraph, columnChars);

      lines.forEach((text, index) =>
        place({ text, x: MARGIN, size }, leading + (index === 0 ? gap : 0)),
      );
      continue;
    }

    if ('code' in block) {
      block.code.forEach((text, index) =>
        place(
          { text, x: MARGIN + 12, size: size * 0.9, font: 'mono' },
          size * 1.2 + (index === 0 ? gap : 0),
        ),
      );
      continue;
    }

    const items = 'bullets' in block ? block.bullets : block.steps;

    items.forEach((item, itemIndex) => {
      const marker = 'bullets' in block ? '•' : `${itemIndex + 1}.`;

      wrapWords(item, columnChars - 4).forEach((text, lineIndex) => {
        const advance = leading + (itemIndex === 0 && lineIndex === 0 ? gap : 0);

        if (lineIndex === 0) {
          // The marker and its text are separate runs, as word processors write them.
          place({ text: marker, x: MARGIN + 6, size }, advance);
          pages[pages.length - 1]!.push({ text, x: MARGIN + 22, y: Math.round(y * 10) / 10, size });
        } else {
          place({ text, x: MARGIN + 22, size }, advance);
        }
      });
    });
  }

  if (options.pageNumbers) {
    pages.forEach((lines, index) =>
      lines.push({ text: String(index + 1), x: LETTER.width / 2, y: 40, size: size * 0.8 }),
    );
  }

  return buildPdf(pages, { title: options.title });
};
