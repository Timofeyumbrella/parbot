'use client';

import { UUID_PATTERN } from '@parbot/shared';
import { cn } from 'cn';
import { ArrowDown, MessageSquareOff, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useCallback } from 'react';

import { useAssistant } from '@/components/assistant-context';
import { ThreadSkeleton } from '@/components/chat/chat-skeletons';
import { Composer } from '@/components/chat/composer';
import { MessageBubble } from '@/components/chat/message-bubble';
import { Welcome } from '@/components/chat/welcome';
import { Button } from '@/components/ui/button';
import { useAutoscroll } from '@/hooks/use-autoscroll';
import { useSendMessage } from '@/hooks/use-send-message';
import { useFeedback, useThread } from '@/hooks/use-thread';
import { isStreaming } from '@/lib/chat/thread';

export type ThreadProps = {
  conversationId: string;
};

/**
 * One conversation. Everything it shows comes from the thread cache: a conversation that was just
 * started renders from it before the database has a row, and a switch to a cached conversation
 * never shows a skeleton. Only a conversation the cache has never seen is read from the server.
 */
export const Thread = ({ conversationId }: ThreadProps) => {
  const assistant = useAssistant();
  const valid = UUID_PATTERN.test(conversationId);
  const { data, isError, error, refetch, isFetching } = useThread(conversationId, valid);
  const { send, stop, retry } = useSendMessage(assistant.id);
  const feedback = useFeedback(conversationId);
  const messages = data?.messages ?? [];
  const streaming = isStreaming(data);
  const { ref, pinned, onScroll, scrollToBottom } = useAutoscroll(
    `${conversationId}:${messages.length}`,
  );

  const handleSend = useCallback(
    (content: string) => {
      void send({ conversationId, content });
      scrollToBottom();
    },
    [send, conversationId, scrollToBottom],
  );

  const handleStop = useCallback(() => stop(conversationId), [stop, conversationId]);
  const handleRetry = useCallback(
    (userId: string) => {
      void retry(conversationId, userId);
      scrollToBottom();
    },
    [retry, conversationId, scrollToBottom],
  );

  if (!valid) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <MessageSquareOff className="text-muted-foreground size-6" />
        <p className="text-sm font-medium">This link does not point to a conversation.</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          Pick one from the list, or start a new chat.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/a/${assistant.id}/chat`}>New chat</Link>
        </Button>
      </div>
    );
  }

  const showSkeleton = !data && !isError;
  const empty = Boolean(data) && messages.length === 0;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      data-testid="thread"
      data-conversation={conversationId}
    >
      <div
        ref={ref}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div
          className={cn(
            'mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-6 sm:px-6',
            empty && 'min-h-full justify-center',
          )}
        >
          {showSkeleton ? (
            <ThreadSkeleton />
          ) : isError && messages.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center" role="alert">
              <p className="text-sm font-medium">The messages could not be loaded.</p>
              <p className="text-muted-foreground max-w-sm text-sm">
                {error instanceof Error ? error.message : 'The request failed.'}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                <RotateCcw data-icon="inline-start" />
                Try again
              </Button>
            </div>
          ) : empty ? (
            <Welcome assistant={assistant} onPick={handleSend} />
          ) : (
            messages.map((message, index) => {
              const previous = messages[index - 1];

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  assistantId={assistant.id}
                  assistantName={assistant.name}
                  onFeedback={feedback}
                  onRetry={handleRetry}
                  questionId={previous?.role === 'user' ? previous.id : undefined}
                />
              );
            })
          )}
        </div>
      </div>

      {!pinned && messages.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="pointer-events-auto rounded-full shadow-md"
            onClick={() => scrollToBottom('smooth')}
          >
            <ArrowDown data-icon="inline-start" />
            Jump to latest
          </Button>
        </div>
      ) : null}

      <div className="bg-background border-t px-4 pb-3 pt-3 sm:px-6">
        <Composer
          key={conversationId}
          className="mx-auto w-full max-w-3xl"
          draftKey={conversationId}
          onSend={handleSend}
          onStop={handleStop}
          streaming={streaming}
        />
      </div>
    </div>
  );
};
