import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { bucketDaily, periodStart } from '@/lib/analytics';

import { DailyChart } from './daily-chart';

afterEach(cleanup);

const NOW = new Date('2026-09-23T12:00:00Z');

const fixture = bucketDaily(
  [
    { day: '2026-09-19', questions: 3, answered: 2, unanswered: 1 },
    { day: '2026-09-21', questions: 5, answered: 5, unanswered: 0 },
    { day: '2026-09-23', questions: 2, answered: 0, unanswered: 2 },
  ],
  periodStart(7, NOW),
  7,
);

describe('DailyChart', () => {
  it('draws one bar per day with a tooltip, a legend and a table twin', () => {
    render(<DailyChart rows={fixture} days={7} />);

    const bars = screen.getAllByTestId('chart-bar');
    expect(bars).toHaveLength(7);

    expect(bars[2]!.querySelector('title')?.textContent).toBe('Sep 19: 3 questions, 2 answered, 1 unanswered');
    expect(bars[6]!.querySelector('title')?.textContent).toBe('Sep 23: 2 questions, 0 answered, 2 unanswered');
    expect(bars[3]!.querySelector('title')?.textContent).toBe('Sep 20: 0 questions, 0 answered, 0 unanswered');

    // A stacked day paints both series; a fully answered day paints only the answered one.
    expect(bars[2]!.querySelector('.fill-chart-2')).not.toBeNull();
    expect(bars[2]!.querySelector('.fill-chart-1')).not.toBeNull();
    expect(bars[4]!.querySelector('.fill-chart-2')).not.toBeNull();
    expect(bars[4]!.querySelector('.fill-chart-1')).toBeNull();
    expect(bars[3]!.querySelector('.fill-chart-2')).toBeNull();

    const legend = screen.getByLabelText('Legend');
    expect(within(legend).getByText('Answered')).toBeInTheDocument();
    expect(within(legend).getByText('Unanswered')).toBeInTheDocument();

    expect(screen.getByRole('img', { name: /Peak of 5 in one day/ })).toBeInTheDocument();
    expect(screen.getByText('Show as a table')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(8);
  });

  it('labels every day of a week and every fifth day of a month', () => {
    const { unmount } = render(<DailyChart rows={fixture} days={7} />);
    expect(screen.getByRole('img').querySelectorAll('text').length).toBeGreaterThanOrEqual(7);
    unmount();

    const month = bucketDaily([{ day: '2026-09-23', questions: 1, answered: 1, unanswered: 0 }], periodStart(30, NOW), 30);
    render(<DailyChart rows={month} days={30} />);

    const labels = [...screen.getByRole('img').querySelectorAll('[data-testid="chart-bar"] text')].map(
      (node) => node.textContent,
    );
    expect(labels).toEqual(['Aug 25', 'Aug 30', 'Sep 4', 'Sep 9', 'Sep 14', 'Sep 19', 'Sep 23']);
  });

  it('shows a zero state instead of an empty plot', () => {
    render(<DailyChart rows={bucketDaily([], periodStart(7, NOW), 7)} days={7} />);

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/No questions in this period/)).toBeInTheDocument();
  });
});
