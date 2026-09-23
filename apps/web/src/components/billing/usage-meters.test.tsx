import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PLANS } from '@/lib/plans';

import { UsageMeter, UsageMeters } from './usage-meters';

describe('UsageMeter', () => {
  it('shows the count against the limit', () => {
    render(<UsageMeter label="Indexed pages" used={12} limit={2000} />);

    expect(screen.getByText('12 of 2,000')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Indexed pages: 12 of 2,000' })).toBeInTheDocument();
    expect(screen.queryByText(/Close to the limit/)).not.toBeInTheDocument();
  });

  it('warns above 80 percent', () => {
    render(<UsageMeter label="Answers this month" used={170} limit={200} />);

    expect(screen.getByText('170 of 200')).toHaveClass('text-warning');
    expect(screen.getByText('Close to the limit.')).toBeInTheDocument();
  });

  it('says what to do at the limit', () => {
    render(<UsageMeter label="Assistants" used={1} limit={1} />);

    expect(screen.getByText('1 of 1')).toHaveClass('text-destructive');
    expect(screen.getByText(/Move to a bigger plan/)).toBeInTheDocument();
  });
});

describe('UsageMeters', () => {
  it('renders the three limits of the plan', () => {
    render(<UsageMeters plan={PLANS.starter} usage={{ assistants: 2, pages: 150, messagesThisMonth: 40 }} />);

    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    expect(screen.getByText('150 of 2,000')).toBeInTheDocument();
    expect(screen.getByText('40 of 3,000')).toBeInTheDocument();
  });
});
