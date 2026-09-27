import { createHash } from 'node:crypto';

import type { UploadType } from '@/lib/uploads';

import { IngestError } from './errors';
import { htmlToMarkdown } from './html';
import { type PdfRun, pdfRunsToMarkdown } from './pdf';

export type ExtractedDocument = {
  /** Title found inside the file, when it carries one. */
  title: string | null;
  markdown: string;
};

/** Content identity for re-indexing: the same Markdown always maps to the same checksum. */
export const checksumOf = (markdown: string) =>
  createHash('sha256').update(markdown, 'utf8').digest('hex');

const decode = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');

const normalizeText = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** The first ATX heading of a Markdown document, the way GitHub names a file. */
export const markdownTitle = (markdown: string) => {
  const match = markdown.match(/^ {0,3}#{1,2}[ \t]+(.+?)[ \t]*#*[ \t]*$/m);

  return match?.[1]?.trim() || null;
};

const PDF_UNREADABLE =
  'This PDF could not be read. It may be damaged or password protected; export it again and upload it once more.';
const DOCX_UNREADABLE =
  'This Word file could not be read. Open it in Word, save it as .docx and upload it once more.';

type PdfDocument = Awaited<ReturnType<(typeof import('unpdf'))['getDocumentProxy']>>;

/** Every page's text runs, read one page at a time so a long file is never held twice. */
const readPdfRuns = async (pdf: PdfDocument) => {
  const pages: PdfRun[][] = [];

  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const runs: PdfRun[] = [];

    for (const item of content.items) {
      if (!('str' in item)) {
        continue;
      }

      const [a = 0, b = 0, c = 0, d = 0, x = 0, y = 0] = item.transform as number[];
      const size = Math.hypot(c, d) || item.height;

      runs.push({
        text: item.str,
        x,
        y,
        width: item.width,
        size,
        monospace: content.styles[item.fontName]?.fontFamily === 'monospace',
        eol: item.hasEOL,
        upright:
          item.dir !== 'ttb' &&
          a > 0 &&
          d > 0 &&
          Math.abs(b) < 0.01 * size &&
          Math.abs(c) < 0.01 * size,
      });
    }

    pages.push(runs);
    page.cleanup();
  }

  return pages;
};

/** The runs as pdf.js strings them together: a line per line, a paragraph per page. */
const plainPdfText = (pages: PdfRun[][]) =>
  normalizeText(
    pages.map((runs) => runs.map((run) => run.text + (run.eol ? '\n' : '')).join('')).join('\n\n'),
  );

/** Titles some exporters write for every file: the application's name, or the file's. */
const PLACEHOLDER_TITLE =
  /^(?:untitled\b.*|microsoft (?:word|powerpoint) - .*|.*\.(?:docx?|pdf|pages|odt|rtf|txt|md|html?|pptx?|key))$/i;

const extractPdf = async (bytes: Uint8Array): Promise<ExtractedDocument> => {
  const { getDocumentProxy, getMeta } = await import('unpdf');
  let pdf: PdfDocument;
  let pages: PdfRun[][];

  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
    pages = await readPdfRuns(pdf);
  } catch (cause) {
    // pdf.js reports damage with its own vocabulary; the person needs to know what to do instead.
    console.warn('[ingest] pdf extraction failed', cause);
    throw new IngestError(PDF_UNREADABLE);
  }

  let markdown: string;

  try {
    markdown = pdfRunsToMarkdown(pages);
  } catch (cause) {
    // The layout is a best guess; a file it cannot make sense of is still indexed as plain text.
    console.warn('[ingest] pdf layout failed, indexing plain text', cause);
    markdown = plainPdfText(pages);
  }

  let metaTitle = '';

  try {
    const { info } = await getMeta(pdf);

    metaTitle = typeof info.Title === 'string' ? info.Title.trim() : '';
  } catch {
    // Metadata is optional; the text is what matters.
  }

  await pdf.loadingTask.destroy().catch(() => undefined);

  const title =
    metaTitle && !PLACEHOLDER_TITLE.test(metaTitle) ? metaTitle : markdownTitle(markdown);

  return { title, markdown };
};

const extractDocx = async (bytes: Uint8Array): Promise<ExtractedDocument> => {
  const mammoth = await import('mammoth');
  let value: string;

  try {
    // Word styles become headings in the HTML, so the Markdown keeps the document's structure.
    ({ value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) }));
  } catch (cause) {
    // A damaged or renamed file fails inside the zip reader with a message about central directories.
    console.warn('[ingest] docx extraction failed', cause);
    throw new IngestError(DOCX_UNREADABLE);
  }

  const extracted = htmlToMarkdown(value, { readability: false });

  return { title: extracted.title, markdown: extracted.markdown };
};

/**
 * Turns an uploaded file into Markdown. A PDF's headings, paragraphs and lists are rebuilt from
 * its layout; DOCX and HTML go through the HTML pipeline so their headings survive; Markdown and
 * plain text are taken as they are.
 */
export const extractUpload = async (
  bytes: Uint8Array,
  type: UploadType,
): Promise<ExtractedDocument> => {
  switch (type) {
    case 'pdf':
      return extractPdf(bytes);
    case 'docx':
      return extractDocx(bytes);
    case 'html': {
      const extracted = htmlToMarkdown(decode(bytes));

      return { title: extracted.title, markdown: extracted.markdown };
    }
    case 'md': {
      const markdown = normalizeText(decode(bytes));

      return { title: markdownTitle(markdown), markdown };
    }
    case 'txt':
      return { title: null, markdown: normalizeText(decode(bytes)) };
  }
};

/** Pasted text was stored as Markdown; it is read back the same way. */
export const extractText = (bytes: Uint8Array): ExtractedDocument => {
  const markdown = normalizeText(decode(bytes));

  return { title: markdownTitle(markdown), markdown };
};
