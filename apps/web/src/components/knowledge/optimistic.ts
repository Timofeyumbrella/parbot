import type { Source } from '@/lib/db';
import type { SourceKind } from './format';

export type OptimisticSourceInput = {
  /** Chosen by the screen and sent to the server, so the row drawn now is the row saved. */
  id: string;
  assistantId: string;
  ownerId: string;
  kind: SourceKind;
  title: string;
  uri?: string;
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
};

/** The row the Knowledge screen shows before the server has answered. Queued, nothing indexed yet. */
export const optimisticSource = (input: OptimisticSourceInput): Source => {
  const now = new Date().toISOString();

  return {
    id: input.id,
    assistant_id: input.assistantId,
    owner_id: input.ownerId,
    kind: input.kind,
    title: input.title,
    uri: input.uri ?? null,
    storage_path: input.fileName ? `${input.ownerId}/${input.assistantId}/${input.fileName}` : null,
    mime_type: input.mimeType ?? null,
    byte_size: input.byteSize ?? null,
    status: 'queued',
    error: null,
    pages_found: 0,
    pages_done: 0,
    document_count: 0,
    chunk_count: 0,
    last_indexed_at: null,
    created_at: now,
    updated_at: now,
  };
};
