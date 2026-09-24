import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { bucketDaily, periodStart } from '@/lib/analytics';

import { DailyChart } from './daily-chart';

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

const labelsOf = (svg: HTMLElement) =>
  [...svg.querySelectorAll('[data-testid="chart-bar"] text')].map((node) => node.textContent);

describe('DailyChart', () => {
  it('draws one bar per day with a tooltip, a legend and a table twin', () => {
    render(<DailyChart rows={fixture} days={7} />);

    const wide = screen.getByTestId('chart-wide');
    const bars = within(wide).getAllByTestId('chart-bar');
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

    expect(wide).toHaveAttribute('aria-label', expect.stringContaining('Peak of 5 in one day'));
    expect(screen.getByText('Show as a table')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(8);
  });

  it('draws a phone-sized twin with fewer labels so they stay legible', () => {
    const month = bucketDaily([{ day: '2026-09-23', questions: 1, answered: 1, unanswered: 0 }], periodStart(30, NOW), 30);
    render(<DailyChart rows={month} days={30} />);

    const wide = screen.getByTestId('chart-wide');
    const narrow = screen.getByTestId('chart-narrow');

    expect(wide).toHaveAttribute('viewBox', '0 0 720 220');
    expect(narrow).toHaveAttribute('viewBox', '0 0 360 200');
    expect(within(narrow).getAllByTestId('chart-bar')).toHaveLength(30);

    const wideLabels = labelsOf(wide);
    const narrowLabels = labelsOf(narrow);
    expect(wideLabels[0]).toBe('Aug 25');
    expect(wideLabels.at(-1)).toBe('Sep 23');
    expect(wideLabels.length).toBeGreaterThan(narrowLabels.length);
    expect(narrowLabels).toEqual(['Aug 25', 'Aug 30', 'Sep 4', 'Sep 9', 'Sep 14', 'Sep 23']);

    // Every label is drawn at a size that survives the phone's scale.
    for (const text of narrow.querySelectorAll('text')) {
      expect(text).toHaveAttribute('font-size', '11');
    }
  });

  it('labels every day of a week on both drawings', () => {
    render(<DailyChart rows={fixture} days={7} />);

    expect(labelsOf(screen.getByTestId('chart-wide'))).toHaveLength(7);
    expect(labelsOf(screen.getByTestId('chart-narrow'))).toHaveLength(7);
  });

  it('shows a zero state instead of an empty plot', () => {
    render(<DailyChart rows={bucketDaily([], periodStart(7, NOW), 7)} days={7} />);

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/No questions in this period/)).toBeInTheDocument();
  });
});
