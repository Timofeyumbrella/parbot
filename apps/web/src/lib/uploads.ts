/**
 * What can be uploaded as a source. Shared by the API route (validation and storage) and the
 * Knowledge screen (file picker and copy), so keep it free of server-only imports.
 */

export type UploadType = 'pdf' | 'txt' | 'md' | 'html' | 'docx';

export const UPLOAD_TYPES: Record<
  UploadType,
  { mime: string; extensions: string[]; label: string }
> = {
  pdf: { mime: 'application/pdf', extensions: ['pdf'], label: 'PDF' },
  txt: { mime: 'text/plain', extensions: ['txt', 'text'], label: 'Text' },
  md: { mime: 'text/markdown', extensions: ['md', 'markdown', 'mdx'], label: 'Markdown' },
  html: { mime: 'text/html', extensions: ['html', 'htm', 'xhtml'], label: 'HTML' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
    label: 'Word',
  },
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** The Storage bucket every uploaded or pasted source lives in, under `<owner_id>/<assistant_id>/`. */
export const STORAGE_BUCKET = 'sources';

/** The `accept` attribute for the file picker. */
export const UPLOAD_ACCEPT = Object.values(UPLOAD_TYPES)
  .flatMap((type) => type.extensions.map((extension) => `.${extension}`))
  .join(',');

export const UPLOAD_TYPES_LABEL = 'PDF, Word, HTML, Markdown or plain text';

const MIME_ALIASES: Record<string, UploadType> = {
  'text/x-markdown': 'md',
  'application/xhtml+xml': 'html',
};

export const extensionOf = (fileName: string) => {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');

  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
};

/**
 * Resolves the upload type from the file name first, then the declared MIME type. Browsers report
 * odd types for Markdown and none at all for some files, so the extension is the better signal.
 */
export const uploadTypeFor = (fileName: string, mimeType?: string | null): UploadType | null => {
  const extension = extensionOf(fileName);

  for (const [type, spec] of Object.entries(UPLOAD_TYPES) as [
    UploadType,
    (typeof UPLOAD_TYPES)[UploadType],
  ][]) {
    if (spec.extensions.includes(extension)) {
      return type;
    }
  }

  const mime = mimeType?.split(';')[0]?.trim().toLowerCase() ?? '';

  if (mime in MIME_ALIASES) {
    return MIME_ALIASES[mime]!;
  }

  for (const [type, spec] of Object.entries(UPLOAD_TYPES) as [
    UploadType,
    (typeof UPLOAD_TYPES)[UploadType],
  ][]) {
    if (spec.mime === mime) {
      return type;
    }
  }

  return null;
};

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Objects live under <owner_id>/<assistant_id>/ so the storage policies can check ownership. */
export const storagePathFor = (ownerId: string, assistantId: string, extension: string) =>
  `${ownerId}/${assistantId}/${crypto.randomUUID()}.${extension}`;

export const fileNameFromPath = (storagePath: string) =>
  storagePath.split('/').pop() ?? storagePath;
