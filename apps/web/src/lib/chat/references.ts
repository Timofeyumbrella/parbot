import { MAX_REFERENCES } from '@parbot/shared';

import type { Enums, Json } from '@/lib/db/types';

/**
 * References in the chat composer, like @ in Claude: the reader points a question at files and
 * sources of the assistant's knowledge. Pure helpers, shared by the composer, the send path and
 * the thread, so the unit tests exercise exactly what the screen runs.
 */

export type SourceKind = Enums<'source_kind'>;
export type SourceStatus = Enums<'source_status'>;

/** A source a question points at, as its chip and the stored message show it. */
export type MessageReference = { id: string; title: string; kind: SourceKind };

/** A source the picker offers. */
export type ReferenceOption = MessageReference & {
  status: SourceStatus;
  /** The second line: the address of a website, the type and size of a file. */
  detail: string;
  createdAt: string;
  /** The stored file's size in bytes, which tells a file attached again from a new one. */
  byteSize?: number | null;
};

/** The title an uploaded file gets in Knowledge: its name, as the upload route stores it. */
export const uploadTitle = (name: string) => name.slice(0, 200);

/**
 * The upload already in Knowledge that a file attached from the chat is a copy of: same name and
 * same size, and not failed (a failed one is worth uploading again). Attaching it again would add
 * a second source, and answers would cite both.
 */
export const findKnownUpload = (
  options: readonly ReferenceOption[],
  file: { name: string; size: number },
) => {
  const title = uploadTitle(file.name);

  return options.find(
    (option) =>
      option.kind === 'upload' &&
      option.status !== 'failed' &&
      option.title === title &&
      option.byteSize === file.size,
  );
};

/** What a chip says about its source right now. */
export type ChipStatus = 'uploading' | 'indexing' | 'ready' | 'failed' | 'missing' | 'unknown';

export { MAX_REFERENCES };

const KINDS: readonly SourceKind[] = ['url', 'sitemap', 'upload', 'text'];

const isReference = (value: unknown): value is MessageReference => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    KINDS.includes(candidate.kind as SourceKind)
  );
};

/** The references stored on a message; anything that is not the expected shape is dropped. */
export const parseReferences = (value: Json | null | undefined): MessageReference[] =>
  Array.isArray(value)
    ? value.filter(isReference).map(({ id, title, kind }) => ({ id, title, kind }))
    : [];

export const toReference = ({ id, title, kind }: MessageReference): MessageReference => ({
  id,
  title,
  kind,
});

/** Adds a reference once, at the end, and never past the limit (a question's, unless told). */
export const addReference = (
  references: MessageReference[],
  added: MessageReference,
  limit = MAX_REFERENCES,
) =>
  references.some((reference) => reference.id === added.id) || references.length >= limit
    ? references
    : [...references, toReference(added)];

export const removeReference = (references: MessageReference[], id: string) =>
  references.filter((reference) => reference.id !== id);

export const sameReferences = (a: MessageReference[], b: MessageReference[]) =>
  a.length === b.length && a.every((reference, index) => reference.id === b[index]?.id);

/** An @ being typed: where it starts and what follows it up to the caret. */
export type Mention = { start: number; query: string };

const MAX_QUERY = 60;

/**
 * The mention the caret is in, if any: an @ at the start of the text or after a space, followed by
 * no line break. A space right after the @ ends it ("@ home" is prose); an email address never
 * starts one, since its @ follows a letter.
 */
export const findMention = (text: string, caret: number): Mention | null => {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');

  if (at === -1) {
    return null;
  }

  const query = before.slice(at + 1);

  if (at > 0 && !/\s/.test(before[at - 1]!)) {
    return null;
  }

  if (query.length > MAX_QUERY || /\n/.test(query) || /^\s/.test(query)) {
    return null;
  }

  return { start: at, query };
};

/** The text with the @query taken out, and where the caret goes. */
export const removeMention = (text: string, mention: Mention, caret: number) => {
  const after = text.slice(caret);
  const head = text.slice(0, mention.start);
  // One space between the words either side is enough.
  const joined = head.endsWith(' ') && after.startsWith(' ') ? after.slice(1) : after;

  return { text: `${head}${joined}`, caret: head.length };
};

const rank = (option: ReferenceOption, query: string) => {
  const title = option.title.toLowerCase();

  if (!query) {
    return 0;
  }

  if (title.startsWith(query)) {
    return 0;
  }

  if (title.split(/[\s._\-/]+/).some((word) => word.startsWith(query))) {
    return 1;
  }

  if (title.includes(query)) {
    return 2;
  }

  return option.detail.toLowerCase().includes(query) ? 3 : null;
};

/**
 * The picker's list for what follows the @: title matches first (the start of the title, then the
 * start of a word, then anywhere), then matches in the address or file type. Newest first within
 * each, the way Knowledge lists them.
 */
export const filterReferenceOptions = (options: ReferenceOption[], query: string) => {
  const needle = query.trim().toLowerCase();

  return options
    .map((option) => ({ option, score: rank(option, needle) }))
    .filter((entry): entry is { option: ReferenceOption; score: number } => entry.score !== null)
    .sort(
      (a, b) =>
        a.score - b.score ||
        (a.option.createdAt < b.option.createdAt
          ? 1
          : a.option.createdAt > b.option.createdAt
            ? -1
            : 0),
    )
    .map((entry) => entry.option);
};

export const isIndexingStatus = (status: SourceStatus) =>
  status === 'queued' || status === 'crawling' || status === 'indexing';

export type UploadState =
  { status: 'uploading' } | { status: 'saved' } | { status: 'failed'; error: string };

/**
 * A chip's status. An upload in flight or refused speaks for itself; otherwise the source's row
 * does. A source the list does not have (deleted) is missing once the list has loaded; before
 * that nothing is claimed.
 */
export const chipStatus = (input: {
  upload?: UploadState;
  source?: Pick<ReferenceOption, 'status'>;
  loaded: boolean;
}): ChipStatus => {
  if (input.upload?.status === 'uploading') {
    return 'uploading';
  }

  if (input.upload?.status === 'failed') {
    return 'failed';
  }

  if (input.source) {
    return input.source.status === 'ready'
      ? 'ready'
      : input.source.status === 'failed'
        ? 'failed'
        : 'indexing';
  }

  if (input.upload?.status === 'saved') {
    // Saved a moment ago and not in the list yet: it is queued for indexing.
    return 'indexing';
  }

  return input.loaded ? 'missing' : 'unknown';
};

export const CHIP_STATUS_LABEL: Record<ChipStatus, string | null> = {
  uploading: 'Uploading',
  indexing: 'Indexing',
  ready: 'Ready',
  failed: 'Failed',
  missing: 'Removed',
  unknown: null,
};

/**
 * A chip's label: its status, or for a file the reader attached that Knowledge already had (see
 * `findKnownUpload`), that it is that file, while it can be read or is still being indexed.
 */
export const chipLabel = (status: ChipStatus, known = false) =>
  known && status === 'ready'
    ? 'Already in Knowledge'
    : known && status === 'indexing'
      ? 'Already in Knowledge, indexing'
      : CHIP_STATUS_LABEL[status];

/** The line the thinking state shows while files attached to a question finish uploading. */
export const uploadingMessage = (titles: string[]) => {
  const [first] = titles;

  if (!first) {
    return 'Uploading…';
  }

  return titles.length === 1
    ? `Uploading ${first}…`
    : `Uploading ${first} and ${titles.length - 1} more…`;
};
