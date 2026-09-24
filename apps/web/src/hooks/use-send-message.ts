'use client';

import { type AppChatRequest, type ChatStreamEvent, readChatStream } from '@parbot/shared';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { confirmConversation, type ConversationRow, draftTitle, upsertConversation } from '@/lib/chat/conversations';
import { conversationsKey, threadKey } from '@/lib/chat/queries';
import { streamRegistry } from '@/lib/chat/streams';
import {
  applyStreamEvent,
  beginExchange,
  emptyThread,
  failedMessage,
  removeExchange,
  stopExchange,
  tempId,
  type Thread,
} from '@/lib/chat/thread';

export type SendInput = { conversationId: string; content: string };

const nextFrame =
  typeof requestAnimationFrame === 'function'
    ? (callback: () => void) => requestAnimationFrame(callback)
    : (callback: () => void) => setTimeout(callback, 16) as unknown as number;

const cancelFrame =
  typeof cancelAnimationFrame === 'function'
    ? (handle: number) => cancelAnimationFrame(handle)
    : (handle: number) => clearTimeout(handle);

/**
 * Sends one message. The reader's bubble and an empty answer land in the cache before the request
 * leaves, and every event from the server is folded into the cache from then on. Tokens are
 * coalesced per animation frame so React renders at most once a frame while text streams.
 */
export const sendMessage = async (queryClient: QueryClient, assistantId: string, input: SendInput) => {
  const content = input.content.trim();

  if (!content) {
    return;
  }

  const { conversationId } = input;
  const key = threadKey(conversationId);
  const listKey = conversationsKey(assistantId);
  const userId = tempId();
  const assistantMessageId = tempId();
  const now = new Date().toISOString();

  queryClient.setQueryData<Thread>(key, (thread) =>
    beginExchange(thread ?? emptyThread(), { userId, assistantId: assistantMessageId, content, now }),
  );

  queryClient.setQueryData<ConversationRow[]>(listKey, (rows) => {
    const existing = rows?.find((row) => row.id === conversationId);

    return upsertConversation(rows ?? [], {
      id: conversationId,
      title: existing?.title ?? draftTitle(content),
      last_message_at: now,
      message_count: (existing?.message_count ?? 0) + 1,
      unanswered_count: existing?.unanswered_count ?? 0,
      pending: existing ? existing.pending : true,
    });
  });

  const controller = streamRegistry.start(conversationId);
  const apply = (event: ChatStreamEvent) =>
    queryClient.setQueryData<Thread>(key, (thread) => applyStreamEvent(thread ?? emptyThread(), event));

  let buffer = '';
  let frame: number | null = null;

  const flush = () => {
    if (frame !== null) {
      cancelFrame(frame);
      frame = null;
    }

    if (buffer) {
      const text = buffer;
      buffer = '';
      apply({ type: 'token', text });
    }
  };

  const schedule = () => {
    frame ??= nextFrame(flush);
  };

  const settle = (event: ChatStreamEvent) => {
    flush();
    apply(event);
  };

  try {
    const body: AppChatRequest = { assistantId, conversationId, message: content };
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    for await (const event of readChatStream(response)) {
      if (controller.signal.aborted) {
        break;
      }

      if (event.type === 'token') {
        buffer += event.text;
        schedule();
        continue;
      }

      settle(event);

      if (event.type === 'meta') {
        queryClient.setQueryData<ConversationRow[]>(listKey, (rows) =>
          rows ? confirmConversation(rows, conversationId) : rows,
        );
      }

      if (event.type === 'done') {
        queryClient.setQueryData<ConversationRow[]>(listKey, (rows) =>
          rows?.map((row) =>
            row.id === conversationId
              ? {
                  ...row,
                  message_count: row.message_count + 1,
                  unanswered_count: row.unanswered_count + (event.answered ? 0 : 1),
                  last_message_at: new Date().toISOString(),
                }
              : row,
          ),
        );
      }
    }

    flush();

    if (controller.signal.aborted) {
      queryClient.setQueryData<Thread>(key, (thread) => (thread ? stopExchange(thread) : thread));
    } else if (queryClient.getQueryData<Thread>(key)?.active) {
      // The server closed the stream without a final event: treat it as a failure the reader can retry.
      apply({ type: 'error', code: 'internal', message: 'The connection closed before the answer finished.' });
    }
  } catch (cause) {
    flush();

    if (controller.signal.aborted) {
      queryClient.setQueryData<Thread>(key, (thread) => (thread ? stopExchange(thread) : thread));
    } else {
      apply({
        type: 'error',
        code: 'internal',
        message:
          cause instanceof Error && cause.message
            ? `The request failed: ${cause.message}`
            : 'The request failed. Check your connection and try again.',
      });
    }
  } finally {
    streamRegistry.finish(conversationId, controller);
  }
};

/** Aborts the stream; the partial answer stays in the thread. */
export const stopMessage = (queryClient: QueryClient, conversationId: string) => {
  if (!streamRegistry.stop(conversationId)) {
    // Nothing is in flight (for instance after a hot reload) but the cache still says so.
    queryClient.setQueryData<Thread>(threadKey(conversationId), (thread) => (thread ? stopExchange(thread) : thread));
  }
};

/** Drops the failed pair and sends the same text again. */
export const retryMessage = (queryClient: QueryClient, assistantId: string, conversationId: string, userId: string) => {
  const key = threadKey(conversationId);
  const thread = queryClient.getQueryData<Thread>(key);
  const failed = thread ? failedMessage(thread, userId) : null;

  if (!thread || !failed) {
    return Promise.resolve();
  }

  queryClient.setQueryData<Thread>(key, removeExchange(thread, userId));

  return sendMessage(queryClient, assistantId, { conversationId, content: failed.content });
};

export const useSendMessage = (assistantId: string) => {
  const queryClient = useQueryClient();

  const send = useCallback((input: SendInput) => sendMessage(queryClient, assistantId, input), [queryClient, assistantId]);
  const stop = useCallback((conversationId: string) => stopMessage(queryClient, conversationId), [queryClient]);
  const retry = useCallback(
    (conversationId: string, userId: string) => retryMessage(queryClient, assistantId, conversationId, userId),
    [queryClient, assistantId],
  );

  return useMemo(() => ({ send, stop, retry }), [send, stop, retry]);
};
