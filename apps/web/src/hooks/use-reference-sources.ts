'use client';

import { type QueryClient, useQuery } from '@tanstack/react-query';

import { describeSource } from '@/components/knowledge/format';
import { CHAT_NAMESPACE } from '@/lib/chat/queries';
import { isIndexingStatus, type ReferenceOption } from '@/lib/chat/references';
import type { Source } from '@/lib/db';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/** The chat's own list of the assistant's sources, for the @ picker and the chips' statuses. */
export const referenceSourcesKey = (assistantId: string) =>
  [...CHAT_NAMESPACE, 'sources', assistantId] as const;

/** How often the list is read again while a source the composer can see is being indexed. */
export const REFERENCE_POLL_MS = 1500;

type SourceRow = Pick<
  Source,
  | 'id'
  | 'kind'
  | 'title'
  | 'status'
  | 'uri'
  | 'storage_path'
  | 'mime_type'
  | 'byte_size'
  | 'created_at'
>;

export const toReferenceOption = (row: SourceRow): ReferenceOption => ({
  id: row.id,
  title: row.title,
  kind: row.kind,
  status: row.status,
  detail: describeSource(row),
  createdAt: row.created_at,
});

const loadReferenceOptions = async (assistantId: string) => {
  const { data, error } = await getSupabaseBrowserClient()
    .from('sources')
    .select('id, kind, title, status, uri, storage_path, mime_type, byte_size, created_at')
    .eq('assistant_id', assistantId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`The sources could not be loaded (${error.message}).`);
  }

  return data.map(toReferenceOption);
};

/**
 * The assistant's sources, newest first. Read as soon as a composer mounts so the picker opens
 * with its list, and read again while a source the composer shows as a chip (`watched`) is being
 * indexed, so the chip moves from Indexing to Ready by itself. A long crawl nobody pointed at is
 * left to the Knowledge screen.
 */
export const useReferenceSources = (assistantId: string, watched: readonly string[] = []) =>
  useQuery({
    queryKey: referenceSourcesKey(assistantId),
    queryFn: () => loadReferenceOptions(assistantId),
    staleTime: 5_000,
    refetchInterval: (query) =>
      query.state.data?.some(
        (option) => watched.includes(option.id) && isIndexingStatus(option.status),
      )
        ? REFERENCE_POLL_MS
        : false,
  });

/** Puts a source the composer just uploaded into the list, before the next read brings it. */
export const upsertReferenceOption = (
  queryClient: QueryClient,
  assistantId: string,
  row: SourceRow,
) =>
  queryClient.setQueryData<ReferenceOption[]>(referenceSourcesKey(assistantId), (options) => [
    toReferenceOption(row),
    ...(options ?? []).filter((option) => option.id !== row.id),
  ]);
