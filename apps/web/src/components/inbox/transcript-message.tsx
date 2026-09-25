import type { Citation } from '@parbot/shared';
import { cn } from 'cn';
import { Bot, ThumbsDown, ThumbsUp, UserRound } from 'lucide-react';
import { z } from 'zod';

import { AnswerMarkdown } from '@/components/chat/answer-markdown';
import { Sources } from '@/components/chat/sources';
import { UnansweredBadge } from '@/components/inbox/channel-badge';
import { LocalTime } from '@/components/inbox/local-time';
import type { Message } from '@/lib/db';

const citationSchema = z.object({
  index: z.number(),
  documentId: z.string(),
  title: z.string(),
  url: z.string().nullable().optional(),
  snippet: z.string().optional(),
});

/** Citations are stored as JSON; anything malformed is dropped rather than shown broken. */
export const parseCitations = (value: unknown): Citation[] => {
  const parsed = z.array(citationSchema).safeParse(value);

  return parsed.success
    ? parsed.data.map((citation) => ({ ...citation, url: citation.url ?? null, snippet: citation.snippet ?? '' }))
    : [];
};

export type TranscriptMessageProps = {
  message: Pick<Message, 'id' | 'role' | 'content' | 'citations' | 'answered' | 'feedback' | 'created_at'>;
  now: number;
};

/**
 * One turn of a transcript, read-only: the answer and its sources render through the chat's own
 * components, so an answer reads the same in the Inbox as it did in the chat, plus feedback and the
 * answered flag.
 */
export const TranscriptMessage = ({ message, now }: TranscriptMessageProps) => {
  const isUser = message.role === 'user';
  const citations = isUser ? [] : parseCitations(message.citations);
  const unanswered = !isUser && message.answered === false;
  // The chat's id for the same row, where an inline marker without a url points.
  const sourcesId = `sources-${message.id}`;

  return (
    <article
      className={cn('flex gap-3', isUser && 'flex-row-reverse')}
      data-role={message.role}
      data-testid="transcript-message"
      aria-label={isUser ? 'Visitor message' : 'Assistant message'}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md',
          isUser ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground',
        )}
      >
        {isUser ? <UserRound className="size-3.5" /> : <Bot className="size-3.5" />}
      </span>

      <div className={cn('flex min-w-0 max-w-[85%] flex-col gap-1.5', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm leading-relaxed',
            isUser ? 'bg-muted' : 'bg-card ring-foreground/10 ring-1',
            unanswered && 'ring-warning/40',
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <AnswerMarkdown content={message.content} citations={citations} sourcesId={sourcesId} />
          )}

          {citations.length > 0 ? (
            <div className="mt-2">
              <Sources citations={citations} id={sourcesId} />
            </div>
          ) : null}
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-2 px-1 text-xs">
          <LocalTime value={message.created_at} now={now} />
          {unanswered ? <UnansweredBadge /> : null}
          {message.feedback === 1 ? (
            <span className="inline-flex items-center gap-1" title="The reader marked this answer as helpful">
              <ThumbsUp aria-hidden="true" className="text-success size-3.5" />
              Helpful
            </span>
          ) : message.feedback === -1 ? (
            <span className="inline-flex items-center gap-1" title="The reader marked this answer as not helpful">
              <ThumbsDown aria-hidden="true" className="text-destructive size-3.5" />
              Not helpful
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
};
