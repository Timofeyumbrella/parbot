'use client';

import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import type { ComposerChip } from '@/components/chat/reference-chips';
import { describeSource } from '@/components/knowledge/format';
import { CHAT_NAMESPACE } from '@/lib/chat/queries';
import {
  addReference,
  chipStatus,
  type DraftReference,
  findKnownUpload,
  isIndexingStatus,
  type MessageReference,
  type ReferenceOption,
  toReference,
  uploadTitle,
} from '@/lib/chat/references';
import { composerUploads } from '@/lib/chat/uploads';
import type { Source } from '@/lib/db';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { uploadProblem } from '@/lib/uploads';

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
  byteSize: row.byte_size,
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

const serverSnapshot = () => 0;

/**
 * Chips for references: where each file is (Uploading, Indexing, Ready, Failed, Removed), from the
 * upload in flight or the source's row. `fixed` are chips the reader cannot take off here (a
 * project's files); both lists are watched, so a chip moves to Ready by itself.
 */
export const useReferenceChips = (
  assistantId: string,
  references: DraftReference[],
  fixed: MessageReference[] = [],
) => {
  const watched = useMemo(
    () => [...references, ...fixed].map((reference) => reference.id),
    [references, fixed],
  );
  const sources = useReferenceSources(assistantId, watched);
  // Chip statuses follow uploads as they finish.
  useSyncExternalStore(composerUploads.subscribe, composerUploads.version, serverSnapshot);

  const byId = useMemo(
    () => new Map((sources.data ?? []).map((option) => [option.id, option])),
    [sources.data],
  );
  // A chip is "already in Knowledge" only when its own reference says so (the attach made it),
  // never because the same source was attached somewhere else.
  const toChip = (reference: DraftReference): ComposerChip => {
    const upload = composerUploads.state(reference.id);

    return {
      ...reference,
      status: chipStatus({ upload, source: byId.get(reference.id), loaded: sources.isSuccess }),
      error: upload?.status === 'failed' ? upload.error : undefined,
    };
  };

  return { chips: references.map(toChip), fixedChips: fixed.map(toChip), sources };
};

/** Knowledge lists sources under its own keys; a file attached from the chat should show there too. */
const KNOWLEDGE_NAMESPACE = ['knowledge'] as const;

/**
 * Attaching files from the chat: each one is uploaded into Knowledge through the same route the
 * Add source dialog uses, and becomes a reference at once, with its upload's status on its chip.
 * A file Knowledge already has (same name and size, not failed), or one uploading from an attach
 * a moment ago, is referenced as it is instead of being uploaded a second time; its chip says it
 * is the file already in Knowledge. Returns the references with the new files added, up to `limit`.
 */
export const useAttachFiles = (assistantId: string) => {
  const queryClient = useQueryClient();

  return useCallback(
    (
      files: File[],
      current: DraftReference[],
      options: { limit: number; limitMessage: string },
    ): DraftReference[] => {
      let next = current;
      const listed = queryClient.getQueryData<ReferenceOption[]>(referenceSourcesKey(assistantId));

      for (const file of files) {
        const problem = uploadProblem(file);

        if (problem) {
          toast.error(`${file.name} was not attached. ${problem}`);
          continue;
        }

        const inKnowledge = listed ? findKnownUpload(listed, file) : undefined;
        const inFlight = inKnowledge ? null : composerUploads.find(assistantId, file);
        const same: DraftReference | null = inKnowledge
          ? { ...toReference(inKnowledge), known: true }
          : inFlight
            ? { id: inFlight, title: uploadTitle(file.name), kind: 'upload' }
            : null;

        if (same && next.some((reference) => reference.id === same.id)) {
          continue;
        }

        if (next.length >= options.limit) {
          toast.error(options.limitMessage);
          break;
        }

        if (same) {
          if (inKnowledge) {
            // The list may be a few seconds old: read it again, so a copy deleted in the
            // meantime shows as Removed on its chip rather than as Ready.
            void queryClient.invalidateQueries({
              queryKey: referenceSourcesKey(assistantId),
              exact: true,
            });
          }

          next = addReference(next, same, options.limit);
          continue;
        }

        const reference: MessageReference = {
          id: crypto.randomUUID(),
          title: uploadTitle(file.name),
          kind: 'upload',
        };

        next = addReference(next, reference, options.limit);
        void composerUploads.start(
          { id: reference.id, assistantId, file },
          {
            onSaved: (source) => {
              upsertReferenceOption(queryClient, assistantId, source);
              void queryClient.invalidateQueries({ queryKey: KNOWLEDGE_NAMESPACE });
            },
            onFailed: (error) => toast.error(`${reference.title} could not be uploaded. ${error}`),
          },
        );
      }

      return next;
    },
    [queryClient, assistantId],
  );
};
