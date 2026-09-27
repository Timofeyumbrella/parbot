import { ArrowUpRight, ThumbsDown } from 'lucide-react';
import Link from 'next/link';

import { LocalTime } from '@/components/inbox/local-time';
import { formatCount } from '@/lib/format';

import { NextStep, Section, SectionEmpty } from './section';

export type DislikedAnswer = {
  messageId: string;
  conversationId: string;
  answeredAt: string;
  /** The question the answer replied to; null when the transcript no longer has it. */
  question: string | null;
  /** The answer's first line as plain text. */
  preview: string;
};

export type DislikedAnswersProps = {
  assistantId: string;
  answers: DislikedAnswer[];
  total: number;
  now: number;
};

/** The latest answers readers rated thumbs down, each linked to the answer in its transcript. */
export const DislikedAnswers = ({ assistantId, answers, total, now }: DislikedAnswersProps) => (
  <Section
    testId="disliked-answers"
    title="Answers readers disliked"
    count={total}
    why="A thumbs down usually means the page behind the answer is wrong, out of date or unclear."
    footer={
      answers.length > 0 ? (
        <NextStep href={`/a/${assistantId}/knowledge`}>
          Fix the page, then re-index its source in Knowledge
        </NextStep>
      ) : undefined
    }
  >
    {answers.length === 0 ? (
      <SectionEmpty>
        No thumbs down in this period. Readers rate answers with a thumb up or down in the widget
        and in Chat.
      </SectionEmpty>
    ) : (
      <ul>
        {answers.map((answer) => (
          <li key={answer.messageId} className="border-b last:border-0">
            <Link
              href={`/a/${assistantId}/inbox/${answer.conversationId}#message-${answer.messageId}`}
              className="hover:bg-muted/60 px-(--card-spacing) flex items-start gap-3 py-2.5 text-sm transition-colors"
              data-testid="disliked-row"
            >
              <ThumbsDown aria-hidden="true" className="text-destructive mt-0.5 size-3.5 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="line-clamp-2 break-words font-medium">
                  {answer.question ?? 'Question not found'}
                </p>
                <p className="text-muted-foreground line-clamp-2 break-words text-xs">
                  {answer.preview || 'An empty answer'}
                </p>
              </div>
              <LocalTime
                value={answer.answeredAt}
                now={now}
                className="text-muted-foreground shrink-0 whitespace-nowrap text-xs"
              />
              <ArrowUpRight
                aria-hidden="true"
                className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
              />
            </Link>
          </li>
        ))}
      </ul>
    )}
    {total > answers.length ? (
      <p className="text-muted-foreground px-(--card-spacing) border-t py-2 text-xs">
        {formatCount(total - answers.length)} older in this period.
      </p>
    ) : null}
  </Section>
);
