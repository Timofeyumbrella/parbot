import { FileText, Globe, type LucideIcon, Map, TextAlignStart } from 'lucide-react';

import type { Enums, Source } from '@/lib/db';
import { formatCount } from '@/lib/format';
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

export const plural = (count: number, noun: string) => `${formatCount(count)} ${count === 1 ? noun : `${noun}s`}`;
