'use client';

import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

import { deleteConversation, renameConversation } from '@/actions/conversations';
import {
  applyServerRow,
  type ConversationRow,
  type ConversationSnapshot,
  mergeConversationLists,
  mergeSnapshot,
  removeConversationRow,
  renameConversationRow,
} from '@/lib/chat/conversations';
import { overlayProjectState } from '@/lib/chat/project-state';
import {
  conversationsKey,
  fetchConversations,
  INBOX_NAMESPACE,
  threadKey,
} from '@/lib/chat/queries';
import { streamRegistry } from '@/lib/chat/streams';
import type { Conversation } from '@/lib/db';
import { getSupabaseBrowserClient, realtimeReadyClient } from '@/lib/supabase/client';

/**
 * The server clock of the newest snapshot folded into each assistant's list. The router can hand
 * the layout's payload over more than once (two panes, a cached navigation); a snapshot that is
 * not newer than the last one applied is a replay and is ignored.
 */
const appliedSnapshots = new Map<string, number>();

/** Test hook. */
export const resetAppliedSnapshots = () => {
  appliedSnapshots.clear();
};

/**
 * The assistant's conversation list. The layout hands over a snapshot from the server; from then
 * on the cache is the truth, refreshed through the browser client when it goes stale and folded
 * together with any newer snapshot a later visit brings.
 */
export const useConversations = (assistantId: string, snapshot?: ConversationSnapshot) => {
  const queryClient = useQueryClient();
  const key = conversationsKey(assistantId);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const applied = appliedSnapshots.get(assistantId) ?? 0;

    if (snapshot.fetchedAt <= applied) {
      return;
    }

    const listKey = conversationsKey(assistantId);
    // setQueryData marks the list fresh. A list another screen invalidated (a delete in the
    // Inbox) must still be read again, because a snapshot never drops rows.
    const invalidated = queryClient.getQueryState(listKey)?.isInvalidated ?? false;

    appliedSnapshots.set(assistantId, snapshot.fetchedAt);
    // Server rows never undo a move or a project delete the reader just made (see `project-state`).
    queryClient.setQueryData<ConversationRow[]>(listKey, (rows) =>
      overlayProjectState(mergeSnapshot(rows, snapshot.rows)),
    );

    if (invalidated) {
      void queryClient.invalidateQueries({ queryKey: listKey, exact: true });
    }
  }, [snapshot, assistantId, queryClient]);

  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const fetched = await fetchConversations(getSupabaseBrowserClient(), assistantId);

      return overlayProjectState(
        mergeConversationLists(queryClient.getQueryData<ConversationRow[]>(key), fetched),
      );
    },
    initialData: snapshot
      ? () => overlayProjectState(mergeSnapshot(undefined, snapshot.rows))
      : undefined,
    initialDataUpdatedAt: snapshot ? Date.now : undefined,
  });
};

/**
 * One row from the list cache, for a header that names the open conversation. Never fetches on
 * its own: the list pane owns the query, this observer only reads what it holds. The queryFn is
 * still named so TanStack does not treat the observer as misconfigured.
 */
export const useConversationRow = (assistantId: string, conversationId: string | null) => {
  const { data } = useQuery<ConversationRow[]>({
    queryKey: conversationsKey(assistantId),
    queryFn: () => fetchConversations(getSupabaseBrowserClient(), assistantId),
    enabled: false,
  });

  return conversationId ? (data?.find((row) => row.id === conversationId) ?? null) : null;
};

/** The whole list as the cache holds it, for a screen beside the list. Never fetches on its own. */
export const useConversationListCache = (assistantId: string) =>
  useQuery<ConversationRow[]>({
    queryKey: conversationsKey(assistantId),
    queryFn: () => fetchConversations(getSupabaseBrowserClient(), assistantId),
    enabled: false,
  }).data;

/**
 * Keeps the list fresh from the database: titles the engine sets, activity, rows created in
 * another tab. The channel joins only once the session is loaded, because a join without the
 * user's token runs as anon and the server rejects the filter without a word.
 */
export const useConversationsRealtime = (assistantId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const key = conversationsKey(assistantId);
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    void realtimeReadyClient().then((supabase) => {
      if (cancelled) {
        return;
      }

      channel = supabase
        .channel(`chat:conversations:${assistantId}:${Math.random().toString(36).slice(2)}`)
        .on<Conversation>(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversations',
            filter: `assistant_id=eq.${assistantId}`,
          },
          (payload: RealtimePostgresChangesPayload<Conversation>) => {
            if (payload.eventType === 'DELETE') {
              const id = payload.old.id;

              if (id) {
                queryClient.setQueryData<ConversationRow[]>(key, (rows) =>
                  rows ? removeConversationRow(rows, id) : rows,
                );
              }

              return;
            }

            const row = payload.new;

            if (row.channel !== 'app') {
              return;
            }

            queryClient.setQueryData<ConversationRow[]>(key, (rows) =>
              overlayProjectState(
                applyServerRow(rows ?? [], {
                  id: row.id,
                  title: row.title,
                  last_message_at: row.last_message_at,
                  message_count: row.message_count,
                  unanswered_count: row.unanswered_count,
                  project_id: row.project_id ?? null,
                }),
              ),
            );
          },
        )
        .subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(
              `Chat: the conversations channel did not join (${status}).`,
              error?.message ?? '',
            );
          }
        });
    });

    return () => {
      cancelled = true;

      if (channel) {
        void getSupabaseBrowserClient().removeChannel(channel);
      }
    };
  }, [assistantId, queryClient]);
};

/**
 * Rename and delete, applied to the cache first and rolled back if the action fails. Both tell
 * the inbox to refetch, since it lists the same rows under its own keys.
 */
export const useConversationActions = (assistantId: string) => {
  const queryClient = useQueryClient();
  const key = conversationsKey(assistantId);

  const rename = useCallback(
    async (id: string, title: string) => {
      const next = title.trim();
      const previous = queryClient.getQueryData<ConversationRow[]>(key);

      if (!next) {
        return false;
      }

      queryClient.setQueryData<ConversationRow[]>(key, (rows) =>
        renameConversationRow(rows ?? [], id, next),
      );

      const result = await renameConversation({ id, title: next });

      if (!result.ok) {
        queryClient.setQueryData<ConversationRow[]>(key, previous);
        toast.error(result.error);

        return false;
      }

      void queryClient.invalidateQueries({ queryKey: INBOX_NAMESPACE });

      return true;
    },
    [queryClient, key],
  );

  /**
   * The row and its thread leave the cache at once, and the action is dispatched before the
   * caller navigates: a navigation started afterwards takes priority in the router's queue, so
   * the screen moves on while the delete is still in flight.
   */
  const remove = useCallback(
    async (id: string) => {
      const previous = queryClient.getQueryData<ConversationRow[]>(key);
      const thread = queryClient.getQueryData(threadKey(id));

      streamRegistry.stop(id);
      queryClient.setQueryData<ConversationRow[]>(key, (rows) =>
        removeConversationRow(rows ?? [], id),
      );
      queryClient.removeQueries({ queryKey: threadKey(id) });

      const result = await deleteConversation({ id });

      if (!result.ok) {
        queryClient.setQueryData<ConversationRow[]>(key, previous);

        if (thread) {
          queryClient.setQueryData(threadKey(id), thread);
        }

        toast.error(result.error);

        return false;
      }

      void queryClient.invalidateQueries({ queryKey: INBOX_NAMESPACE });

      return true;
    },
    [queryClient, key],
  );

  return useMemo(() => ({ rename, remove }), [rename, remove]);
};
