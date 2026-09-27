/**
 * Where a document, a source and a stored file open. Shared by the chat, the Inbox and Knowledge,
 * so a citation, a reference chip and a Knowledge row all lead to the same screens.
 */

/** The in-app viewer for one indexed page; `passage` is a chunk id to scroll to and highlight. */
export const documentHref = (assistantId: string, documentId: string, passage?: string | null) =>
  `/a/${assistantId}/knowledge/documents/${documentId}${
    passage ? `?passage=${encodeURIComponent(passage)}` : ''
  }`;

/** A source's text: its only page for a file or pasted text, the list of pages for a website. */
export const sourceHref = (assistantId: string, sourceId: string) =>
  `/a/${assistantId}/knowledge/sources/${sourceId}`;

/** The original file, for its owner: opens in the browser, or downloads for Word. */
export const sourceFileHref = (sourceId: string) => `/api/sources/${sourceId}/file`;

/** Uploads and pasted text keep a file in Storage; websites and sitemaps do not. */
export const hasStoredFile = (kind: string) => kind === 'upload' || kind === 'text';

/** What the link to the original says, by kind. */
export const originalLabel = (kind: string) =>
  kind === 'upload' ? 'Open file' : kind === 'text' ? 'Open original' : 'Open page';
