import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { bucketDaily, periodStart } from '@/lib/analytics';
import { EMPTY_TOTALS, type PeriodTotals } from '@/lib/overview';

import { AnswerQuality } from './answer-quality';

const ASSISTANT = 'asst-1';
const NOW = new Date('2026-09-23T12:00:00Z');
const daily = bucketDaily(
  [{ day: '2026-09-22', questions: 10, answered: 8, unanswered: 2 }],
  periodStart(7, NOW),
  7,
);

const totals = (overrides: Partial<PeriodTotals>): PeriodTotals => ({
  ...EMPTY_TOTALS,
  ...overrides,
});

const metric = (testId: string) => {
  const node = screen.getByTestId(testId);

  return {
    value: within(node).getByTestId('metric-value').textContent,
    change: within(node).getByTestId('change'),
    caption: within(node).getByTestId('metric-caption').textContent,
  };
};

describe('AnswerQuality', () => {
  it('shows the rates and the answer time with their change on the previous period', () => {
    render(
      <AnswerQuality
        assistantId={ASSISTANT}
        days={7}
        current={totals({
          questions: 52,
          answered: 41,
          unanswered: 9,
          positive: 3,
          negative: 1,
          medianLatencyMs: 1400,
        })}
        previous={totals({
          questions: 40,
          answered: 38,
          unanswered: 12,
          positive: 8,
          negative: 2,
          medianLatencyMs: 1900,
        })}
        daily={daily}
      />,
    );

    const rate = metric('metric-answer-rate');
    expect(rate.value).toBe('82%');
    // 82% against 76%: up and good.
    expect(rate.change).toHaveAttribute('data-direction', 'up');
    expect(rate.change).toHaveAttribute('data-tone', 'good');
    expect(rate.change).toHaveTextContent('Up 6 pts on the 7 days before');
    expect(rate.caption).toBe('41 of 50 answers came from the docs.');

    const helpful = metric('metric-helpful');
    expect(helpful.value).toBe('75%');
    // 75% against 80%: down and bad.
    expect(helpful.change).toHaveAttribute('data-tone', 'bad');
    expect(helpful.change).toHaveTextContent('Down 5 pts');
    // Four ratings read as the small sample they are.
    expect(helpful.caption).toBe(
      '3 of 4 ratings were a thumb up. Too few ratings to read much into yet.',
    );

    const time = metric('metric-time');
    expect(time.value).toBe('1.4 s');
    // Faster is better: down and good.
    expect(time.change).toHaveAttribute('data-direction', 'down');
    expect(time.change).toHaveAttribute('data-tone', 'good');
    // In the unit of the value above it: "1.4 s", so "0.5 s", not "500 ms".
    expect(time.change).toHaveTextContent('Down 0.5 s');

    expect(screen.getByRole('link', { name: /Read the 9 unanswered questions/ })).toHaveAttribute(
      'href',
      `/a/${ASSISTANT}/inbox?filter=unanswered`,
    );
    expect(screen.getByTestId('daily-chart')).toBeInTheDocument();
  });

  it('says there is nothing to compare with when the previous period was empty', () => {
    render(
      <AnswerQuality
        assistantId={ASSISTANT}
        days={30}
        current={totals({ answered: 4, positive: 12, negative: 0, medianLatencyMs: 900 })}
        previous={EMPTY_TOTALS}
        daily={daily}
      />,
    );

    for (const id of ['metric-answer-rate', 'metric-helpful', 'metric-time']) {
      expect(metric(id).change).toHaveTextContent('Nothing to compare with in the 30 days before');
    }

    // Twelve ratings are enough to read without a warning.
    expect(metric('metric-helpful').caption).toBe('12 of 12 ratings were a thumb up.');
    expect(
      screen.getByText('Every finished answer in this period came from the docs.'),
    ).toBeVisible();
  });

  it('shows a dash rather than 0% when nothing was answered or rated', () => {
    render(
      <AnswerQuality
        assistantId={ASSISTANT}
        days={7}
        current={totals({ questions: 2 })}
        previous={totals({ answered: 1 })}
        daily={daily}
      />,
    );

    expect(metric('metric-answer-rate').value).toBe('–');
    expect(metric('metric-answer-rate').caption).toBe('No finished answers in this period.');
    expect(metric('metric-helpful').caption).toMatch(/^No ratings yet/);
    expect(metric('metric-time').value).toBe('–');
    // Nothing finished, so nothing to claim about the docs: the next step is to ask.
    expect(screen.queryByText(/Every finished answer/)).toBeNull();
    expect(
      screen.getByRole('link', { name: /Ask the assistant something in Chat/ }),
    ).toHaveAttribute('href', `/a/${ASSISTANT}/chat`);
  });

  it('agrees with a count of one in every caption and link', () => {
    // Regression: one rating read "1 of 1 rating were a thumb up."
    render(
      <AnswerQuality
        assistantId={ASSISTANT}
        days={7}
        current={totals({ answered: 1, unanswered: 1, positive: 1, negative: 0 })}
        previous={totals({ answered: 1, unanswered: 0, positive: 0, negative: 1 })}
        daily={daily}
      />,
    );

    expect(metric('metric-answer-rate').caption).toBe('1 of 2 answers came from the docs.');
    expect(metric('metric-helpful').caption).toBe(
      '1 of 1 rating was a thumb up. Too few ratings to read much into yet.',
    );
    expect(
      screen.getByRole('link', { name: 'Read the unanswered question in the Inbox' }),
    ).toHaveAttribute('href', `/a/${ASSISTANT}/inbox?filter=unanswered`);
  });

  it('says "were" for none and for several thumbs up', () => {
    render(
      <AnswerQuality
        assistantId={ASSISTANT}
        days={7}
        current={totals({ answered: 1, positive: 0, negative: 1 })}
        previous={EMPTY_TOTALS}
        daily={daily}
      />,
    );

    expect(metric('metric-answer-rate').caption).toBe('1 of 1 answer came from the docs.');
    expect(metric('metric-helpful').caption).toBe(
      '0 of 1 rating were a thumb up. Too few ratings to read much into yet.',
    );
  });

  it('reads a small move in answer time as no change', () => {
    render(
      <AnswerQuality
        assistantId={ASSISTANT}
        days={7}
        current={totals({ answered: 1, medianLatencyMs: 1450 })}
        previous={totals({ answered: 1, medianLatencyMs: 1400 })}
        daily={daily}
      />,
    );

    const change = metric('metric-time').change;

    expect(change).toHaveAttribute('data-direction', 'flat');
    expect(change).toHaveAttribute('data-tone', 'neutral');
    expect(change).toHaveTextContent('No change on the 7 days before');
  });
});
