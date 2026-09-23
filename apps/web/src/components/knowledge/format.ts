import { FileText, Globe, type LucideIcon, Map, TextAlignStart } from 'lucide-react';

import type { Enums, Source } from '@/lib/db';
import { formatBytes, UPLOAD_TYPES, uploadTypeFor } from '@/lib/uploads';

export type SourceKind = Enums<'source_kind'>;
export type SourceStatus = Enums<'source_status'>;

export const SOURCE_KINDS: Record<SourceKind, { label: string; icon: LucideIcon }> = {
  url: { label: 'Website', icon: Globe },
  sitemap: { label: 'Sitemap', icon: Map },
  upload: { label: 'File', icon: FileText },
  text: { label: 'Pasted text', icon: TextAlignStart },
};

/** A source still moving through the pipeline; the list polls while any is. */
export const isActiveStatus = (status: SourceStatus) =>
  status === 'queued' || status === 'crawling' || status === 'indexing';

/** The second line of a row: the address for web sources, the file's type and size otherwise. */
export const describeSource = (source: Pick<Source, 'kind' | 'uri' | 'storage_path' | 'mime_type' | 'byte_size'>) => {
  if (source.kind === 'url' || source.kind === 'sitemap') {
    return source.uri ?? '';
  }

  const type = uploadTypeFor(source.storage_path ?? '', source.mime_type);
  const label = source.kind === 'text' ? 'Pasted text' : type ? `${UPLOAD_TYPES[type].label} file` : 'File';

  return source.byte_size ? `${label} · ${formatBytes(source.byte_size)}` : label;
};

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "just now", "4 minutes ago", "3 days ago". Past only; the future reads as "just now". */
export const relativeTime = (iso: string | null, now = Date.now()) => {
  if (!iso) {
    return null;
  }

  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);

  if (!Number.isFinite(seconds) || seconds < 45) {
    return 'just now';
  }

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      return formatter.format(-Math.round(seconds / size), unit);
    }
  }

  return 'just now';
};

export const plural = (count: number, noun: string) =>
  `${count.toLocaleString('en-US')} ${count === 1 ? noun : `${noun}s`}`;
