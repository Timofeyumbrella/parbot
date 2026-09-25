'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { fetchThread, threadKey } from '@/lib/chat/queries';
import { isStreaming, setFeedback, type Thread } from '@/lib/chat/thread';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * The messages of one conversation. Renders from the cache when it has them; otherwise reads
 * through the browser client. A conversation the database has never seen is simply empty.
 */
export const useThread = (conversationId: string, enabled = true) => {
  const queryClient = useQueryClient();
  const key = threadKey(conversationId);
  const read = useCallback(() => queryClient.getQueryData<Thread>(key), [queryClient, key]);

  return useQuery({
    queryKey: key,
    queryFn: () => fetchThread(getSupabaseBrowserClient(), conversationId, read),
    // A refetch while an answer streams would race the tokens; the merge handles the rest.
    enabled: enabled && !isStreaming(read()),
  });
};

/**
 * Starts reading a conversation the reader is about to open (a hovered or focused row), so its
 * messages are often in the cache by the time the click lands. A thread already cached is left
 * alone: it may be streaming, and the pane refreshes it itself when it goes stale.
 */
export const usePrefetchThread = () => {
  const queryClient = useQueryClient();

  return useCallback(
    (conversationId: string) => {
      const key = threadKey(conversationId);

      if (queryClient.getQueryData(key) !== undefined) {
        return;
      }

      void queryClient.prefetchQuery({
        queryKey: key,
        queryFn: () =>
          fetchThread(getSupabaseBrowserClient(), conversationId, () =>
            queryClient.getQueryData<Thread>(key),
          ),
      });
    },
    [queryClient],
  );
};

/** Thumbs up or down on an answer. The thread updates first and rolls back if the server says no. */
export const useFeedback = (conversationId: string) => {
  const queryClient = useQueryClient();
  const key = threadKey(conversationId);

  return useCallback(
    async (messageId: string, value: 1 | -1 | null) => {
      const previous = queryClient.getQueryData<Thread>(key);

      queryClient.setQueryData<Thread>(key, (thread) =>
        thread ? setFeedback(thread, messageId, value) : thread,
      );

      try {
        const response = await fetch(`/api/messages/${messageId}/feedback`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;

          throw new Error(body?.error ?? 'The feedback could not be saved.');
        }
      } catch (cause) {
        queryClient.setQueryData<Thread>(key, previous);
        toast.error(cause instanceof Error ? cause.message : 'The feedback could not be saved.');
      }
    },
    [queryClient, key],
  );
};
