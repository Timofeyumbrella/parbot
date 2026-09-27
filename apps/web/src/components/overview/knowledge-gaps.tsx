import { ArrowUpRight, Plus } from 'lucide-react';
import Link from 'next/link';

import { LocalTime } from '@/components/inbox/local-time';
import { Button } from '@/components/ui/button';
import { inboxHref } from '@/lib/analytics';
import { formatCount, plural } from '@/lib/format';
import type { GapGroup } from '@/lib/overview';

import { NextStep, Section, SectionEmpty } from './section';

/** Knowledge's Add source dialog, opened on arrival. */
export const addDocsHref = (assistantId: string) => `/a/${assistantId}/knowledge?add=url`;

const Variants = ({ variants }: { variants: string[] }) => {
  if (variants.length === 0) {
    return null;
  }

  const [first] = variants;
  const more = variants.length - 1;

  return (
    <p
      className="text-muted-foreground line-clamp-2 break-words text-xs"
      title={variants.join('\n')}
    >
      Also asked as “{first}”{more > 0 ? ` and ${formatCount(more)} more` : ''}
    </p>
  );
};

export type KnowledgeGapsProps = {
  assistantId: string;
  gaps: GapGroup[];
  /** How many groups there are in all; only the first few are listed. */
  total: number;
  now: number;
};

/** Unanswered questions grouped by similar wording, most asked first. */
export const KnowledgeGaps = ({ assistantId, gaps, total, now }: KnowledgeGapsProps) => (
  <Section
    testId="knowledge-gaps"
    title="Knowledge gaps"
    count={total}
    why="Questions the docs could not answer, with similar wordings grouped. Each one is a page to write or extend."
    action={
      <Button asChild size="sm">
        <Link href={addDocsHref(assistantId)}>
          <Plus data-icon="inline-start" aria-hidden="true" />
          Add docs
        </Link>
      </Button>
    }
    footer={
      total > gaps.length ? (
        <NextStep href={inboxHref(assistantId, 'conversations', 'unanswered')}>
          {formatCount(total - gaps.length)} more in the Inbox
        </NextStep>
      ) : gaps.length > 0 ? (
        'Once the docs cover a question, re-index the source and ask it in Chat to check.'
      ) : undefined
    }
  >
    {gaps.length === 0 ? (
      <SectionEmpty>
        No unanswered questions in this period. New ones show here as readers ask them.
      </SectionEmpty>
    ) : (
      <ul>
        {gaps.map((gap) => (
          <li key={`${gap.conversationId}-${gap.question}`} className="border-b last:border-0">
            <Link
              href={`/a/${assistantId}/inbox/${gap.conversationId}`}
              className="hover:bg-muted/60 px-(--card-spacing) flex items-start gap-3 py-2.5 text-sm transition-colors"
              data-testid="gap-row"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="line-clamp-2 break-words" title={gap.question}>
                  {gap.question}
                </p>
                <Variants variants={gap.variants} />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
                <span
                  className="whitespace-nowrap font-medium tabular-nums"
                  title={`Asked ${plural(gap.asks, 'time')}`}
                  data-testid="gap-asks"
                >
                  {plural(gap.asks, 'time')}
                </span>
                <LocalTime
                  value={gap.lastAskedAt}
                  now={now}
                  className="text-muted-foreground whitespace-nowrap"
                />
              </div>
              <ArrowUpRight
                aria-hidden="true"
                className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
              />
            </Link>
          </li>
        ))}
      </ul>
    )}
  </Section>
);
