import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { relativeTime } from '@/lib/format';

import { HowItWorks, STEPS } from './how-it-works';

describe('HowItWorks', () => {
  it('shows every step with its whole detail line', () => {
    render(<HowItWorks />);

    expect(screen.getAllByRole('listitem')).toHaveLength(STEPS.length);

    for (const step of STEPS) {
      expect(screen.getByRole('heading', { level: 3, name: step.title })).toBeInTheDocument();

      // The detail is a mono sample sized for a third-width card; it wraps rather than being cut off.
      const detail = screen.getByText(step.detail);
      expect(detail).toHaveTextContent(step.detail);
      expect(detail.className).not.toContain('truncate');
      expect(detail.className).toContain('break-words');
    }
  });

  it('shows the index freshness the way the Knowledge screen prints it', () => {
    const now = new Date('2026-09-25T12:00:00Z');
    const indexedAt = new Date(now.getTime() - 2 * 60_000);

    expect(STEPS[1].detail).toContain(`indexed ${relativeTime(indexedAt, now)}`);
  });
});
