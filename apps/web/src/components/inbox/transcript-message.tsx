import { cn } from 'cn';
import { Bot, ThumbsDown, ThumbsUp, UserRound } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { z } from 'zod';

import { UnansweredBadge } from '@/components/inbox/channel-badge';
import { absoluteTime, relativeTime } from '@/lib/analytics';
import type { Message } from '@/lib/db';

const citationSchema = z.object({
  index: z.number(),
  documentId: z.string(),
  title: z.string(),
  url: z.string().nullable().optional(),
  snippet: z.string().optional(),
});

export type TranscriptCitation = z.infer<typeof citationSchema>;

/** Citations are stored as JSON; anything malformed is dropped rather than shown broken. */
export const parseCitations = (value: unknown): TranscriptCitation[] => {
  const parsed = z.array(citationSchema).safeParse(value);

  return parsed.success ? parsed.data : [];
};

export type TranscriptMessageProps = {
  message: Pick<Message, 'id' | 'role' | 'content' | 'citations' | 'answered' | 'feedback' | 'created_at'>;
  now: number;
};

const components = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-4">
      {children}
    </a>
  ),
  p: ({ children }: { children?: React.ReactNode }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="my-2 list-disc pl-5">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="my-2 list-decimal pl-5">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="my-0.5">{children}</li>,
  h1: ({ children }: { children?: React.ReactNode }) => <p className="my-2 font-semibold">{children}</p>,
  h2: ({ children }: { children?: React.ReactNode }) => <p className="my-2 font-semibold">{children}</p>,
  h3: ({ children }: { children?: React.ReactNode }) => <p className="my-2 font-semibold">{children}</p>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="text-muted-foreground my-2 border-l-2 pl-3">{children}</blockquote>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-muted my-2 overflow-x-auto rounded-md p-3 font-mono text-xs [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-left text-xs [&_td]:border-b [&_td]:px-2 [&_td]:py-1 [&_th]:border-b [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium">
        {children}
      </table>
    </div>
  ),
};

/** One turn of a transcript, read-only: Markdown body, sources, feedback and the answered flag. */
export const TranscriptMessage = ({ message, now }: TranscriptMessageProps) => {
  const isUser = message.role === 'user';
  const citations = isUser ? [] : parseCitations(message.citations);
  const unanswered = !isUser && message.answered === false;

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
            <Markdown remarkPlugins={[remarkGfm]} components={components}>
              {message.content}
            </Markdown>
          )}

          {citations.length > 0 ? (
            <div className="mt-2 border-t pt-2">
              <p className="text-muted-foreground mb-1 text-xs font-medium">Sources</p>
              <ol className="flex flex-col gap-0.5 text-xs">
                {citations.map((citation) => (
                  <li key={`${citation.index}-${citation.documentId}`} className="flex gap-1.5">
                    <span className="text-muted-foreground shrink-0 tabular-nums">[{citation.index}]</span>
                    {citation.url ? (
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate underline underline-offset-4"
                        title={citation.snippet}
                      >
                        {citation.title}
                      </a>
                    ) : (
                      <span className="truncate" title={citation.snippet}>
                        {citation.title}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-2 px-1 text-xs">
          <time dateTime={message.created_at} title={absoluteTime(message.created_at)}>
            {relativeTime(message.created_at, now)}
          </time>
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
