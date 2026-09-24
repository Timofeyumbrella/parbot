'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { deleteSource, reindexSource } from '@/actions/sources';
import type { Source } from '@/lib/db';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

import { isActiveStatus } from './format';

export type SourcesSnapshot = { sources: Source[]; pagesUsed: number };

export const sourcesQueryKey = (assistantId: string) => ['sources', assistantId] as const;

/** How often the list is refreshed while a source is being indexed, on top of realtime updates. */
export const ACTIVE_POLL_MS = 4000;

const sortNewestFirst = (sources: Source[]) =>
  [...sources].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

const upsert = (sources: Source[], source: Source) =>
  sortNewestFirst([...sources.filter((existing) => existing.id !== source.id), source]);

const loadSnapshot = async (assistantId: string): Promise<SourcesSnapshot> => {
  const supabase = getSupabaseBrowserClient();
  const [sources, pages] = await Promise.all([
    supabase.from('sources').select('*').eq('assistant_id', assistantId).order('created_at', { ascending: false }),
    supabase.from('documents').select('id', { count: 'exact', head: true }),
  ]);

  if (sources.error) {
    throw new Error(`The sources could not be loaded (${sources.error.message}).`);
  }

  return { sources: sources.data, pagesUsed: pages.count ?? 0 };
};

type UseSourcesOptions = {
  assistantId: string;
  initialSources: Source[];
  initialPagesUsed: number;
};

/**
 * The assistant's sources, kept current three ways: the server's first paint seeds the cache,
 * realtime pushes row changes as ingestion writes them, and a slow poll covers a dropped socket
 * while anything is still indexing.
 */
export const useSources = ({ assistantId, initialSources, initialPagesUsed }: UseSourcesOptions) => {
  const queryClient = useQueryClient();
  const queryKey = sourcesQueryKey(assistantId);

  const query = useQuery({
    queryKey,
    queryFn: () => loadSnapshot(assistantId),
    initialData: { sources: initialSources, pagesUsed: initialPagesUsed },
    refetchInterval: (current) =>
      current.state.data?.sources.some((source) => isActiveStatus(source.status)) ? ACTIVE_POLL_MS : false,
  });

  const setSources = (updater: (sources: Source[]) => Source[]) =>
    queryClient.setQueryData<SourcesSnapshot>(queryKey, (current) =>
      current ? { ...current, sources: updater(current.sources) } : current,
    );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`sources:${assistantId}`)
      .on<Source>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sources', filter: `assistant_id=eq.${assistantId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = payload.old.id;

            if (id) {
              setSources((sources) => sources.filter((source) => source.id !== id));
            }

            return;
          }

          const next = payload.new;

          setSources((sources) => upsert(sources, next));

          // A finished run changed the document count; the poll would catch it, but not this soon.
          if (!isActiveStatus(next.status)) {
            void queryClient.invalidateQueries({ queryKey });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // setSources closes over queryKey, which is derived from assistantId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantId, queryClient]);

  const reindex = useMutation({
    mutationFn: async (source: Source) => {
      const result = await reindexSource(source.id);

      if (result.error || !result.source) {
        throw new Error(result.error ?? 'The source could not be queued.');
      }

      return result.source;
    },
    onMutate: (source) => {
      const previous = queryClient.getQueryData<SourcesSnapshot>(queryKey);

      setSources((sources) =>
        upsert(sources, { ...source, status: 'queued', error: null, pages_found: 0, pages_done: 0 }),
      );

      return { previous };
    },
    onError: (error, _source, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }

      toast.error(error.message);
    },
    onSuccess: (source) => {
      setSources((sources) => upsert(sources, source));
    },
  });

  const remove = useMutation({
    mutationFn: async (source: Source) => {
      const result = await deleteSource(source.id);

      if (result.error) {
        throw new Error(result.error);
      }
    },
    onMutate: (source) => {
      const previous = queryClient.getQueryData<SourcesSnapshot>(queryKey);

      setSources((sources) => sources.filter((existing) => existing.id !== source.id));

      return { previous };
    },
    onError: (error, _source, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }

      toast.error(error.message);
    },
    onSuccess: (_result, source) => {
      toast.success(`Removed ${source.title}.`);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    sources: query.data.sources,
    pagesUsed: query.data.pagesUsed,
    error: query.error,
    isRefreshing: query.isFetching,
    refetch: query.refetch,
    addToCache: (source: Source) => setSources((sources) => upsert(sources, source)),
    reindex: (source: Source) => reindex.mutate(source),
    remove: (source: Source) => remove.mutate(source),
  };
};
