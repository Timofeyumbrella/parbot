'use client';

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

import { deleteConversation, renameConversation } from '@/actions/conversations';
import {
  applyServerRow,
  type ConversationRow,
  mergeConversationLists,
  removeConversationRow,
  renameConversationRow,
} from '@/lib/chat/conversations';
import { conversationsKey, fetchConversations, threadKey } from '@/lib/chat/queries';
import type { Conversation } from '@/lib/db';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * The assistant's conversation list. The layout hands over the first page from the server; from
 * then on the cache is the truth and the browser client refreshes it when it goes stale.
 */
export const useConversations = (assistantId: string, initial?: ConversationRow[]) => {
  const queryClient = useQueryClient();
  const key = conversationsKey(assistantId);

  useEffect(() => {
    // A later visit brings newer rows from the server than the cache holds; fold them in.
    if (initial) {
      queryClient.setQueryData<ConversationRow[]>(conversationsKey(assistantId), (rows) =>
        rows ? mergeConversationLists(rows, initial) : rows,
      );
    }
  }, [initial, assistantId, queryClient]);

  return useQuery({
    queryKey: key,
    queryFn: () =>
      fetchConversations(getSupabaseBrowserClient(), assistantId, queryClient.getQueryData<ConversationRow[]>(key)),
    initialData: initial,
    initialDataUpdatedAt: initial ? Date.now : undefined,
  });
};

/** Keeps the list fresh from the database: titles the engine sets, activity, deletions. */
export const useConversationsRealtime = (assistantId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const key = conversationsKey(assistantId);
    const channel = supabase
      .channel(`conversations:${assistantId}:${Math.random().toString(36).slice(2)}`)
      .on<Conversation>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `assistant_id=eq.${assistantId}` },
        (payload: RealtimePostgresChangesPayload<Conversation>) => {
          if (payload.eventType === 'DELETE') {
            const id = payload.old.id;

            if (id) {
              queryClient.setQueryData<ConversationRow[]>(key, (rows) => (rows ? removeConversationRow(rows, id) : rows));
            }

            return;
          }

          const row = payload.new;

          if (row.channel !== 'app') {
            return;
          }

          queryClient.setQueryData<ConversationRow[]>(key, (rows) =>
            applyServerRow(rows ?? [], {
              id: row.id,
              title: row.title,
              last_message_at: row.last_message_at,
              message_count: row.message_count,
              unanswered_count: row.unanswered_count,
            }),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [assistantId, queryClient]);
};

/** Rename and delete, applied to the cache first and rolled back if the action fails. */
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

      queryClient.setQueryData<ConversationRow[]>(key, (rows) => renameConversationRow(rows ?? [], id, next));

      const result = await renameConversation({ id, title: next });

      if (!result.ok) {
        queryClient.setQueryData<ConversationRow[]>(key, previous);
        toast.error(result.error);

        return false;
      }

      return true;
    },
    [queryClient, key],
  );

  const remove = useCallback(
    async (id: string) => {
      const previous = queryClient.getQueryData<ConversationRow[]>(key);

      queryClient.setQueryData<ConversationRow[]>(key, (rows) => removeConversationRow(rows ?? [], id));

      const result = await deleteConversation({ id });

      if (!result.ok) {
        queryClient.setQueryData<ConversationRow[]>(key, previous);
        toast.error(result.error);

        return false;
      }

      queryClient.removeQueries({ queryKey: threadKey(id) });

      return true;
    },
    [queryClient, key],
  );

  return useMemo(() => ({ rename, remove }), [rename, remove]);
};
