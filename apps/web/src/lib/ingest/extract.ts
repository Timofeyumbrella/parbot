import { createHash } from 'node:crypto';

import type { UploadType } from '@/lib/uploads';

import { IngestError } from './errors';
import { htmlToMarkdown } from './html';

export type ExtractedDocument = {
  /** Title found inside the file, when it carries one. */
  title: string | null;
  markdown: string;
};

/** Content identity for re-indexing: the same Markdown always maps to the same checksum. */
export const checksumOf = (markdown: string) => createHash('sha256').update(markdown, 'utf8').digest('hex');

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

const PDF_UNREADABLE = 'This PDF could not be read. It may be damaged or password protected; export it again and upload it once more.';
const DOCX_UNREADABLE = 'This Word file could not be read. Open it in Word, save it as .docx and upload it once more.';

const extractPdf = async (bytes: Uint8Array): Promise<ExtractedDocument> => {
  const { extractText, getDocumentProxy, getMeta } = await import('unpdf');
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  let text: string;

  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
    ({ text } = await extractText(pdf, { mergePages: true }));
  } catch (cause) {
    // pdf.js reports damage with its own vocabulary; the person needs to know what to do instead.
    console.warn('[ingest] pdf extraction failed', cause);
    throw new IngestError(PDF_UNREADABLE);
  }

  let title: string | null = null;

  try {
    const { info } = await getMeta(pdf);
    const candidate = typeof info.Title === 'string' ? info.Title.trim() : '';

    title = candidate || null;
  } catch {
    // Metadata is optional; the text is what matters.
  }

  return { title, markdown: normalizeText(text) };
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
 * Turns an uploaded file into Markdown. PDF text comes out flat; DOCX and HTML go through the
 * HTML pipeline so their headings survive; Markdown and plain text are taken as they are.
 */
export const extractUpload = async (bytes: Uint8Array, type: UploadType): Promise<ExtractedDocument> => {
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
