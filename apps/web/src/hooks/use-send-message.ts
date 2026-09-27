'use client';

import {
  type AppChatRequest,
  type ChatStreamEvent,
  randomUuid,
  readChatStream,
} from '@parbot/shared';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import {
  confirmConversation,
  type ConversationRow,
  draftTitle,
  upsertConversation,
} from '@/lib/chat/conversations';
import {
  errorEvent,
  fromServerError,
  httpFailure,
  NETWORK_FAILURE,
  STREAM_CUT_SHORT,
} from '@/lib/chat/errors';
import { conversationsKey, INBOX_NAMESPACE, threadKey } from '@/lib/chat/queries';
import { type MessageReference, uploadingMessage } from '@/lib/chat/references';
import { recordStop } from '@/lib/chat/stop';
import { streamRegistry } from '@/lib/chat/streams';
import {
  activeAnswerText,
  applyStreamEvent,
  beginExchange,
  emptyThread,
  failedMessage,
  removeExchange,
  setActiveReferences,
  setProgress,
  stopExchange,
  tempId,
  type Thread,
} from '@/lib/chat/thread';
import { composerUploads } from '@/lib/chat/uploads';

export type SendInput = {
  conversationId: string;
  content: string;
  /**
   * The files and sources the question points at. A list, even an empty one, becomes the
   * conversation's references; left out, the conversation keeps the ones it has.
   */
  references?: MessageReference[];
};

/** Resolves when the signal aborts: a Stop pressed while attached files are still uploading. */
const whenAborted = (signal: AbortSignal) =>
  new Promise<null>((resolve) => {
    if (signal.aborted) {
      resolve(null);
    } else {
      signal.addEventListener('abort', () => resolve(null), { once: true });
    }
  });

const nextFrame =
  typeof requestAnimationFrame === 'function'
    ? (callback: () => void) => requestAnimationFrame(callback)
    : (callback: () => void) => setTimeout(callback, 16) as unknown as number;

const cancelFrame =
  typeof cancelAnimationFrame === 'function'
    ? (handle: number) => cancelAnimationFrame(handle)
    : (handle: number) => clearTimeout(handle);

const isEventStream = (response: Response) =>
  (response.headers.get('content-type') ?? '').includes('text/event-stream');

/**
 * Sends one message. The reader's bubble and an empty answer land in the cache before the request
 * leaves, and every event from the server is folded into the cache from then on. Tokens are
 * coalesced per animation frame so React renders at most once a frame while text streams.
 */
export const sendMessage = async (
  queryClient: QueryClient,
  assistantId: string,
  input: SendInput,
) => {
  const content = input.content.trim();

  if (!content) {
    return;
  }

  const { conversationId } = input;
  const key = threadKey(conversationId);
  const listKey = conversationsKey(assistantId);
  const userId = tempId();
  const assistantMessageId = tempId();
  // The id the server saves the answer under, proposed here so Stop can name the answer at any
  // moment, even before the stream has said anything.
  const answerId = randomUuid();
  const now = new Date().toISOString();
  let references = input.references;
  // Files attached a moment ago may still be on their way; the question shows at once, with its
  // chips, and goes out once they have landed in Knowledge.
  const uploading = composerUploads.pending((references ?? []).map((reference) => reference.id));
  const uploadingTitles = (references ?? [])
    .filter((reference) => uploading.includes(reference.id))
    .map((reference) => reference.title);

  queryClient.setQueryData<Thread>(key, (thread) =>
    beginExchange(thread ?? emptyThread(), {
      userId,
      assistantId: assistantMessageId,
      content,
      now,
      references: references ?? [],
      progress: uploading.length > 0 ? uploadingMessage(uploadingTitles) : undefined,
    }),
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

  const controller = streamRegistry.start(conversationId, { assistantId, messageId: answerId });
  const apply = (event: ChatStreamEvent) =>
    queryClient.setQueryData<Thread>(key, (thread) =>
      applyStreamEvent(thread ?? emptyThread(), event),
    );

  let buffer = '';
  let frame: number | null = null;

  const flush = () => {
    if (frame !== null) {
      cancelFrame(frame);
      frame = null;
    }

    if (controller.signal.aborted) {
      // After Stop the reader keeps exactly what was on screen; that is the text the stop records.
      buffer = '';

      return;
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
    if (uploading.length > 0) {
      const saved = await Promise.race([
        composerUploads.settle(uploading),
        whenAborted(controller.signal),
      ]);

      if (!saved) {
        queryClient.setQueryData<Thread>(key, (thread) => (thread ? stopExchange(thread) : thread));

        return;
      }

      // A file the server refused is not part of the question; its chip in the composer says why.
      const kept = (references ?? []).filter(
        (reference) => !uploading.includes(reference.id) || saved.has(reference.id),
      );

      references = kept;
      queryClient.setQueryData<Thread>(key, (thread) =>
        thread ? setProgress(setActiveReferences(thread, kept), undefined) : thread,
      );
    }

    const body: AppChatRequest = {
      assistantId,
      conversationId,
      message: content,
      assistantMessageId: answerId,
      ...(references ? { references: references.map((reference) => reference.id) } : {}),
    };
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    // The route answers every case as an event stream, so anything else came from in between.
    if (!isEventStream(response)) {
      settle(errorEvent(httpFailure(response.status)));

      return;
    }

    for await (const event of readChatStream(response)) {
      if (controller.signal.aborted) {
        break;
      }

      if (event.type === 'token') {
        buffer += event.text;
        schedule();
        continue;
      }

      settle(event.type === 'error' ? errorEvent(fromServerError(event)) : event);

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
        // The inbox and the overview count this exchange too; they read under their own keys.
        void queryClient.invalidateQueries({ queryKey: INBOX_NAMESPACE });
      }
    }

    flush();

    if (controller.signal.aborted) {
      queryClient.setQueryData<Thread>(key, (thread) => (thread ? stopExchange(thread) : thread));
    } else if (queryClient.getQueryData<Thread>(key)?.active) {
      // The server closed the stream without a final event: treat it as a failure the reader can retry.
      apply(errorEvent(STREAM_CUT_SHORT));
    }
  } catch {
    flush();

    if (controller.signal.aborted) {
      queryClient.setQueryData<Thread>(key, (thread) => (thread ? stopExchange(thread) : thread));
    } else {
      apply(errorEvent(NETWORK_FAILURE));
    }
  } finally {
    streamRegistry.finish(conversationId, controller);
  }
};

/**
 * Stops the answer at once: the stream is aborted and the partial answer stays in the thread as
 * the reader sees it. The server is told separately, without the UI waiting on it: an aborted
 * request does not reach the function on every host, and the stop request carries the text on
 * screen so the saved answer matches it, unmetered.
 */
export const stopMessage = (queryClient: QueryClient, conversationId: string) => {
  const key = threadKey(conversationId);
  // Read before the abort: once it lands, tokens still in the frame buffer are dropped, not shown.
  const shown = activeAnswerText(queryClient.getQueryData<Thread>(key));
  const target = streamRegistry.target(conversationId);

  if (!streamRegistry.stop(conversationId)) {
    // Nothing is in flight (for instance after a hot reload) but the cache still says so.
    queryClient.setQueryData<Thread>(key, (thread) => (thread ? stopExchange(thread) : thread));

    return;
  }

  // No active exchange means `done` already arrived: the answer is complete, there is nothing to stop.
  if (target && shown !== null) {
    void recordStop({ ...target, conversationId, text: shown });
  }
};

/** Drops the failed pair and sends the same text again. */
export const retryMessage = (
  queryClient: QueryClient,
  assistantId: string,
  conversationId: string,
  userId: string,
) => {
  const key = threadKey(conversationId);
  const thread = queryClient.getQueryData<Thread>(key);
  const failed = thread ? failedMessage(thread, userId) : null;

  if (!thread || !failed) {
    return Promise.resolve();
  }

  queryClient.setQueryData<Thread>(key, removeExchange(thread, userId));

  return sendMessage(queryClient, assistantId, {
    conversationId,
    content: failed.content,
    references: failed.references,
  });
};

export const useSendMessage = (assistantId: string) => {
  const queryClient = useQueryClient();

  const send = useCallback(
    (input: SendInput) => sendMessage(queryClient, assistantId, input),
    [queryClient, assistantId],
  );
  const stop = useCallback(
    (conversationId: string) => stopMessage(queryClient, conversationId),
    [queryClient],
  );
  const retry = useCallback(
    (conversationId: string, userId: string) =>
      retryMessage(queryClient, assistantId, conversationId, userId),
    [queryClient, assistantId],
  );

  return useMemo(() => ({ send, stop, retry }), [send, stop, retry]);
};
