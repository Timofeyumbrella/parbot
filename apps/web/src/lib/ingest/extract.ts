import { createHash } from 'node:crypto';

import type { UploadType } from '@/lib/uploads';

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

const extractPdf = async (bytes: Uint8Array): Promise<ExtractedDocument> => {
  const { extractText, getDocumentProxy, getMeta } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
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
  // Word styles become headings in the HTML, so the Markdown keeps the document's structure.
  const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
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
