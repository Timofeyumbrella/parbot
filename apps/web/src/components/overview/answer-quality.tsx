import { inboxHref, type DailyRow } from '@/lib/analytics';
import { formatCount, formatDuration } from '@/lib/format';
import {
  answerRate,
  type Change,
  compare,
  helpfulness,
  LATENCY_TOLERANCE_MS,
  type PeriodTotals,
  SMALL_SAMPLE,
} from '@/lib/overview';

import { ChangeLine } from './change';
import { DailyChart } from './daily-chart';
import { NextStep, Section } from './section';

const Metric = ({
  label,
  value,
  testId,
  children,
}: {
  label: string;
  value: string;
  testId: string;
  children: React.ReactNode;
}) => (
  <div className="flex min-w-0 flex-col gap-1" data-testid={testId}>
    <div className="text-muted-foreground text-xs font-medium">{label}</div>
    {/* Proportional figures: a standalone number reads loose in tabular ones. */}
    <div className="text-2xl font-semibold tracking-tight" data-testid="metric-value">
      {value}
    </div>
    {children}
  </div>
);

const Caption = ({ children }: { children: React.ReactNode }) => (
  <p className="text-muted-foreground text-xs" data-testid="metric-caption">
    {children}
  </p>
);

/** Percentage points, the unit a change between two percentages is read in. */
const points = (change: Change | null) => {
  const amount = change?.amount ?? 0;

  return `${formatCount(amount)} ${amount === 1 ? 'pt' : 'pts'}`;
};

const plural = (count: number, one: string, many: string) =>
  `${formatCount(count)} ${count === 1 ? one : many}`;

export type AnswerQualityProps = {
  assistantId: string;
  days: number;
  current: PeriodTotals;
  previous: PeriodTotals;
  daily: DailyRow[];
};

/**
 * Whether readers get answers, whether those answers help, and how long they wait, each against
 * the period of the same length before, with the daily trend beneath.
 */
export const AnswerQuality = ({
  assistantId,
  days,
  current,
  previous,
  daily,
}: AnswerQualityProps) => {
  const rate = answerRate(current);
  const rateBefore = answerRate(previous);
  const helpful = helpfulness(current);
  const helpfulBefore = helpfulness(previous);
  const rateChange = compare(rate.percent, rateBefore.percent, { higherIsBetter: true });
  const helpfulChange = compare(helpful.percent, helpfulBefore.percent, { higherIsBetter: true });
  const latencyChange = compare(current.medianLatencyMs, previous.medianLatencyMs, {
    higherIsBetter: false,
    tolerance: LATENCY_TOLERANCE_MS,
  });

  return (
    <Section
      testId="answer-quality"
      title="Answer quality"
      why="Whether readers get an answer from the docs and whether it helps. Check it after you change the docs."
      footer={
        current.unanswered > 0 ? (
          <NextStep href={inboxHref(assistantId, 'conversations', 'unanswered')}>
            Read the {plural(current.unanswered, 'unanswered question', 'unanswered questions')} in
            the Inbox
          </NextStep>
        ) : rate.whole > 0 ? (
          'Every finished answer in this period came from the docs.'
        ) : (
          <NextStep href={`/a/${assistantId}/chat`}>Ask the assistant something in Chat</NextStep>
        )
      }
    >
      <div className="px-(--card-spacing) grid gap-x-6 gap-y-5 py-4 sm:grid-cols-3">
        <Metric
          label="Answer rate"
          value={rate.percent === null ? '–' : `${rate.percent}%`}
          testId="metric-answer-rate"
        >
          <ChangeLine change={rateChange} amount={points(rateChange)} days={days} />
          <Caption>
            {rate.whole === 0
              ? 'No finished answers in this period.'
              : `${formatCount(rate.part)} of ${plural(rate.whole, 'answer', 'answers')} came from the docs.`}
          </Caption>
        </Metric>

        <Metric
          label="Helpful"
          value={helpful.percent === null ? '–' : `${helpful.percent}%`}
          testId="metric-helpful"
        >
          <ChangeLine change={helpfulChange} amount={points(helpfulChange)} days={days} />
          <Caption>
            {helpful.whole === 0
              ? 'No ratings yet. Readers rate answers with a thumb up or down.'
              : `${formatCount(helpful.part)} of ${plural(helpful.whole, 'rating', 'ratings')} were a thumb up.${
                  helpful.whole < SMALL_SAMPLE ? ' Too few ratings to read much into yet.' : ''
                }`}
          </Caption>
        </Metric>

        <Metric
          label="Time to answer"
          value={current.medianLatencyMs === null ? '–' : formatDuration(current.medianLatencyMs)}
          testId="metric-time"
        >
          <ChangeLine
            change={latencyChange}
            amount={formatDuration(latencyChange?.amount ?? 0)}
            days={days}
          />
          <Caption>The median, from the question to the finished answer.</Caption>
        </Metric>
      </div>

      <div className="px-(--card-spacing) border-t py-4">
        <DailyChart rows={daily} days={days} />
      </div>
    </Section>
  );
};
