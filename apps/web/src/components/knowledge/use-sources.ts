'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';

import { deleteSource, reindexSource } from '@/actions/sources';
import type { Source } from '@/lib/db';
import { getSupabaseBrowserClient, realtimeReadyClient } from '@/lib/supabase/client';

import { isActiveStatus } from './format';

export const sourcesQueryKey = (assistantId: string) =>
  ['knowledge', assistantId, 'sources'] as const;

/**
 * The pages the plan counts, read off the rows themselves. The server counts the account's
 * documents; every document belongs to a source, a trigger keeps each source's document_count
 * equal to its documents, and an account has one assistant, so the sum over this list is that
 * count. Derived from the cached rows, the meter changes in the same render as they do.
 */
export const pagesUsedBy = (sources: Pick<Source, 'document_count'>[]) =>
  sources.reduce((sum, source) => sum + source.document_count, 0);

/** How often the list is refreshed while a source is being indexed, on top of realtime updates. */
export const ACTIVE_POLL_MS = 4000;

const sortNewestFirst = (sources: Source[]) =>
  [...sources].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );

const upsert = (sources: Source[], source: Source) =>
  sortNewestFirst([...sources.filter((existing) => existing.id !== source.id), source]);

const without = (sources: Source[], id: string) => sources.filter((source) => source.id !== id);

const loadSources = async (assistantId: string) => {
  const { data, error } = await getSupabaseBrowserClient()
    .from('sources')
    .select('*')
    .eq('assistant_id', assistantId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`The sources could not be loaded (${error.message}).`);
  }

  return data;
};

type UseSourcesOptions = {
  assistantId: string;
  initialSources: Source[];
};

/**
 * The assistant's sources, kept current three ways: the server's first paint seeds the cache,
 * realtime pushes row changes as ingestion writes them, and a slow poll covers a dropped socket
 * while anything is still indexing. Rows the screen draws ahead of the server (an added source, a
 * queued re-index, a removed row) survive a poll until the server has answered or realtime has
 * delivered the real row. The pages meter is the sum of the rows drawn, so it never lags them.
 */
export const useSources = ({ assistantId, initialSources }: UseSourcesOptions) => {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => sourcesQueryKey(assistantId), [assistantId]);
  // id -> the row to show in place of the server's, or null while a delete is in flight.
  const overrides = useRef(new Map<string, Source | null>());

  const applyOverrides = useCallback((sources: Source[]) => {
    if (overrides.current.size === 0) {
      return sources;
    }

    const result = sources.filter((source) => !overrides.current.has(source.id));

    for (const row of overrides.current.values()) {
      if (row) {
        result.push(row);
      }
    }

    return sortNewestFirst(result);
  }, []);

  const query = useQuery({
    queryKey,
    queryFn: async () => applyOverrides(await loadSources(assistantId)),
    initialData: initialSources,
    refetchInterval: (current) =>
      current.state.data?.some((source) => isActiveStatus(source.status)) ? ACTIVE_POLL_MS : false,
  });

  const sources = query.data;
  const pagesUsed = useMemo(() => pagesUsedBy(sources), [sources]);

  const setSources = useCallback(
    (updater: (sources: Source[]) => Source[]) =>
      queryClient.setQueryData<Source[]>(queryKey, (current) =>
        current ? updater(current) : current,
      ),
    [queryClient, queryKey],
  );

  /** Shows `row` for `id` (or hides the id) until the server has spoken. */
  const override = useCallback(
    (id: string, row: Source | null) => {
      overrides.current.set(id, row);
      setSources((current) => (row ? upsert(current, row) : without(current, id)));
    },
    [setSources],
  );

  /** The server has spoken: show its row, or nothing. */
  const settle = useCallback(
    (id: string, row: Source | null) => {
      overrides.current.delete(id);
      setSources((current) => (row ? upsert(current, row) : without(current, id)));
    },
    [setSources],
  );

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let client: Awaited<ReturnType<typeof realtimeReadyClient>> | null = null;

    // The channel must join with the visitor's token; before the session is loaded it would run
    // as anon and the server would reject the filtered subscription without a word.
    void realtimeReadyClient().then((supabase) => {
      if (cancelled) {
        return;
      }

      client = supabase;
      channel = supabase
        .channel(`knowledge:sources:${assistantId}`)
        .on<Source>(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'sources',
            filter: `assistant_id=eq.${assistantId}`,
          },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const id = payload.old.id;

              if (id) {
                overrides.current.delete(id);
                setSources((current) => without(current, id));
              }

              return;
            }

            const next = payload.new;

            // The database is the truth; anything the screen assumed about this row is done with.
            overrides.current.delete(next.id);
            setSources((current) => upsert(current, next));
          },
        )
        .subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`[knowledge] realtime subscription ${status}`, error);
          }
        });
    });

    return () => {
      cancelled = true;

      if (client && channel) {
        void client.removeChannel(channel);
      }
    };
  }, [assistantId, setSources]);

  const reindex = useMutation({
    mutationFn: async (source: Source) => {
      const result = await reindexSource(source.id);

      if (result.error || !result.source) {
        throw new Error(result.error ?? 'The source could not be queued.');
      }

      return result.source;
    },
    onMutate: (source) => {
      override(source.id, {
        ...source,
        status: 'queued',
        error: null,
        pages_found: 0,
        pages_done: 0,
      });

      return { previous: source };
    },
    onError: (error, source, context) => {
      settle(source.id, context?.previous ?? source);
      toast.error(error.message);
    },
    onSuccess: (source) => {
      settle(source.id, source);
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
      // Hiding the row takes its pages off the meter in the same render.
      override(source.id, null);

      return { previous: source };
    },
    onError: (error, source, context) => {
      settle(source.id, context?.previous ?? source);
      toast.error(error.message);
    },
    onSuccess: (_result, source) => {
      settle(source.id, null);
      toast.success(`Removed ${source.title}.`);
    },
  });

  return {
    sources,
    pagesUsed,
    error: query.error,
    isRefreshing: query.isFetching,
    refetch: query.refetch,
    /** Draws a source the server has not confirmed yet. */
    addPending: (source: Source) => override(source.id, source),
    /** Replaces the pending row with the saved one, or drops it when the server refused. */
    settleAdd: (id: string, source: Source | null) => settle(id, source),
    reindex: (source: Source) => reindex.mutate(source),
    remove: (source: Source) => remove.mutate(source),
  };
};
