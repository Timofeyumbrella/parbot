'use client';

import { cn } from 'cn';
import { AlertCircle, BookOpen, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';
import Link from 'next/link';
import { memo } from 'react';

import { AnswerMarkdown } from '@/components/chat/answer-markdown';
import { CopyButton } from '@/components/chat/code-block';
import { Sources } from '@/components/chat/sources';
import { Button } from '@/components/ui/button';
import { canRetry, errorAction } from '@/lib/chat/errors';
import { formatLatency } from '@/lib/chat/format';
import type { ThreadMessage } from '@/lib/chat/thread';

export type MessageBubbleProps = {
  message: ThreadMessage;
  assistantId: string;
  assistantName: string;
  onFeedback?: (messageId: string, value: 1 | -1 | null) => void;
  onRetry?: (userMessageId: string) => void;
  /** The id of the user message this answer belongs to, for Retry. */
  questionId?: string;
};

const UserBubble = ({ message }: { message: ThreadMessage }) => (
  <div className="flex flex-col items-end gap-1" data-role="user" data-status={message.status}>
    <div className="bg-muted text-foreground max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
      {message.content}
    </div>
    {message.status === 'failed' ? (
      <span className="text-destructive text-xs">Not sent</span>
    ) : message.status === 'stopped' ? (
      <span className="text-muted-foreground text-xs">Stopped before an answer was saved</span>
    ) : null}
  </div>
);

type ErrorNoticeProps = {
  error: NonNullable<ThreadMessage['error']>;
  onRetry?: () => void;
};

/** What went wrong, a way to fix it when there is one, and Retry when sending again can help. */
const ErrorNotice = ({ error, onRetry }: ErrorNoticeProps) => {
  const action = errorAction(error);
  const retry = onRetry && canRetry(error);

  return (
    <div className="border-destructive/30 bg-destructive/10 flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm" role="alert">
      <div className="flex items-start gap-2">
        <AlertCircle className="text-destructive mt-0.5 size-4 shrink-0" />
        <span>{error.message}</span>
      </div>
      {retry || action ? (
        <div className="flex flex-wrap items-center gap-2">
          {retry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw data-icon="inline-start" />
              Retry
            </Button>
          ) : null}
          {action ? (
            <Button asChild variant={retry ? 'ghost' : 'outline'} size="sm">
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const Thinking = () => (
  <div className="text-muted-foreground flex h-6 items-center gap-1" aria-label="Thinking" role="status">
    <span className="bg-muted-foreground/70 size-1.5 animate-pulse rounded-full [animation-delay:-0.4s]" />
    <span className="bg-muted-foreground/70 size-1.5 animate-pulse rounded-full [animation-delay:-0.2s]" />
    <span className="bg-muted-foreground/70 size-1.5 animate-pulse rounded-full" />
  </div>
);

const AssistantBubble = ({ message, assistantId, assistantName, onFeedback, onRetry, questionId }: MessageBubbleProps) => {
  const sourcesId = `sources-${message.id}`;
  const streaming = message.status === 'streaming';
  const settled = message.status === 'complete' || message.status === 'stopped';
  const unanswered = message.answered === false;
  const latency = formatLatency(message.latency_ms);

  return (
    <div className="group flex gap-3" data-role="assistant" data-status={message.status}>
      <span className="bg-primary mt-2 size-2 shrink-0 rounded-full" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="text-muted-foreground text-xs font-medium">{assistantName}</div>

        {message.status === 'error' ? (
          <ErrorNotice
            error={message.error ?? { code: 'internal', message: 'The answer could not be produced.' }}
            onRetry={onRetry && questionId ? () => onRetry(questionId) : undefined}
          />
        ) : streaming && !message.content ? (
          <Thinking />
        ) : (
          <AnswerMarkdown
            content={message.content}
            citations={message.citations}
            sourcesId={sourcesId}
            streaming={streaming}
            className={cn(unanswered && 'text-muted-foreground')}
          />
        )}

        {unanswered && settled ? (
          <Link
            href={`/a/${assistantId}/knowledge`}
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-xs underline-offset-2 hover:underline"
          >
            <BookOpen className="size-3.5" />
            Add docs that cover this in Knowledge
          </Link>
        ) : null}

        {message.citations.length > 0 ? <Sources citations={message.citations} id={sourcesId} /> : null}

        {settled ? (
          <div
            className={cn(
              'text-muted-foreground -ml-1.5 flex h-6 items-center gap-0.5 text-xs transition-opacity',
              // Hover reveals it on a pointer device; a touch screen has no hover, so it stays visible there.
              'pointer-coarse:opacity-100 opacity-0 group-hover:opacity-100 focus-within:opacity-100',
              (message.feedback !== null || message.status === 'stopped') && 'opacity-100',
            )}
          >
            {message.status === 'stopped' ? <span className="mr-1.5 px-1.5">Stopped</span> : null}
            {latency ? (
              <span className="px-1.5" title="Time to answer">
                {latency}
              </span>
            ) : null}
            {message.content ? <CopyButton text={message.content} /> : null}
            {onFeedback && message.status === 'complete' ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Good answer"
                  aria-pressed={message.feedback === 1}
                  className={cn(message.feedback === 1 && 'text-success')}
                  onClick={() => onFeedback(message.id, message.feedback === 1 ? null : 1)}
                >
                  <ThumbsUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Poor answer"
                  aria-pressed={message.feedback === -1}
                  className={cn(message.feedback === -1 && 'text-destructive')}
                  onClick={() => onFeedback(message.id, message.feedback === -1 ? null : -1)}
                >
                  <ThumbsDown />
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const MessageBubble = memo(function MessageBubble(props: MessageBubbleProps) {
  return props.message.role === 'user' ? <UserBubble message={props.message} /> : <AssistantBubble {...props} />;
});
