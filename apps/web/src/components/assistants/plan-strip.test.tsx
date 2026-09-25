import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PLANS } from '@/lib/plans';

import { PlanStrip } from './plan-strip';

afterEach(cleanup);

/** The bar is a translateX of (100 - percent); the shadcn wrapper keeps the number there. */
const fillOf = (label: string) => {
  const indicator = screen.getByLabelText(label).querySelector('[data-slot=progress-indicator]');

  return (indicator as HTMLElement).style.transform;
};

describe('PlanStrip', () => {
  it('shows the plan, the three meters and the way to billing', () => {
    render(
      <PlanStrip
        plan={PLANS.starter}
        usage={{ assistants: 2, pages: 1500, messagesThisMonth: 40 }}
      />,
    );

    expect(screen.getByText('Starter plan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Manage billing/ })).toHaveAttribute(
      'href',
      '/billing',
    );
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    expect(screen.getByText('1,500 of 2,000')).toBeInTheDocument();
    expect(screen.getByText('40 of 3,000')).toBeInTheDocument();
    expect(fillOf('Assistants: 2 of 3')).toBe('translateX(-33%)');
    expect(fillOf('Pages indexed: 1,500 of 2,000')).toBe('translateX(-25%)');
    expect(fillOf('Answers this month: 40 of 3,000')).toBe('translateX(-99%)');
  });

  it('asks a Hobby account to upgrade and caps a full meter at 100', () => {
    render(
      <PlanStrip plan={PLANS.hobby} usage={{ assistants: 1, pages: 250, messagesThisMonth: 0 }} />,
    );

    expect(screen.getByText('Hobby plan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Upgrade/ })).toHaveAttribute('href', '/billing');
    expect(screen.getByText('1 of 1')).toHaveClass('text-warning');
    expect(screen.getByText('250 of 100')).toHaveClass('text-warning');
    expect(fillOf('Assistants: 1 of 1')).toBe('translateX(-0%)');
    expect(fillOf('Pages indexed: 250 of 100')).toBe('translateX(-0%)');
    expect(fillOf('Answers this month: 0 of 200')).toBe('translateX(-100%)');
  });
});
