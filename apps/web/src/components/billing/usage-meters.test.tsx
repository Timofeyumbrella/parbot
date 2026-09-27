import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

import { PLANS } from '@/lib/plans';

import { UsageMeter, UsageMeters } from './usage-meters';

describe('UsageMeter', () => {
  it('shows the count against the limit', () => {
    render(<UsageMeter label="Indexed pages" used={12} limit={2000} />);

    expect(screen.getByText('12 of 2,000')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Indexed pages: 12 of 2,000' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Close to the limit/)).not.toBeInTheDocument();
  });

  it('warns above 80 percent', () => {
    render(<UsageMeter label="Answers this month" used={170} limit={200} />);

    expect(screen.getByText('170 of 200')).toHaveClass('text-warning');
    expect(screen.getByText('Close to the limit.')).toBeInTheDocument();
  });

  it('says what to do at the limit', () => {
    render(<UsageMeter label="Indexed pages" used={100} limit={100} />);

    expect(screen.getByText('100 of 100')).toHaveClass('text-destructive');
    expect(screen.getByText(/Move to a bigger plan/)).toBeInTheDocument();
  });
});

describe('UsageMeters', () => {
  it('renders the pages and answers limits of the plan, and no assistants meter', () => {
    render(<UsageMeters plan={PLANS.starter} usage={{ pages: 150, messagesThisMonth: 40 }} />);

    expect(screen.getByText('150 of 2,000')).toBeInTheDocument();
    expect(screen.getByText('40 of 3,000')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
    expect(screen.queryByText(/assistant/i)).not.toBeInTheDocument();
  });
});
