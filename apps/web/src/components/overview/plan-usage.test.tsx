import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { projectUsage } from '@/lib/overview';

import { PlanUsage } from './plan-usage';

describe('PlanUsage', () => {
  it('projects the month and stays calm while the pace fits the plan', () => {
    render(
      <PlanUsage
        planName="Starter"
        projection={projectUsage({
          used: 741,
          limit: 3000,
          now: new Date('2026-09-10T12:00:00Z'),
        })}
      />,
    );

    expect(screen.getByTestId('usage-used')).toHaveTextContent('741');
    expect(screen.getByText('of 3,000 answers used')).toBeInTheDocument();
    expect(screen.getByTestId('usage-projection')).toHaveTextContent(
      'At this pace you will use about 2,340 of 3,000 this month.',
    );
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '741');
    expect(screen.getByText('The count resets on Oct 1.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Billing/ })).toBeNull();
  });

  it('links to Billing and names the day when the pace runs past the limit', () => {
    render(
      <PlanUsage
        planName="Hobby"
        projection={projectUsage({ used: 150, limit: 200, now: new Date('2026-09-11T00:00:00Z') })}
      />,
    );

    expect(screen.getByTestId('usage-projection')).toHaveTextContent(
      'At this pace you will use about 450 of 200 this month, and reach the limit around Sep 14.',
    );
    expect(screen.getByRole('link', { name: /Compare plans in Billing/ })).toHaveAttribute(
      'href',
      '/billing',
    );
    expect(screen.getByTestId('usage-projected-bar')).toHaveStyle({ width: '100%' });
  });

  it('says so once the limit is reached', () => {
    render(
      <PlanUsage
        planName="Hobby"
        projection={projectUsage({ used: 200, limit: 200, now: new Date('2026-09-20T00:00:00Z') })}
      />,
    );

    expect(screen.getByTestId('usage-projection')).toHaveTextContent(
      'The limit is reached. Readers get no answers until Oct 1 unless you move to a bigger plan.',
    );
  });

  it('has nothing to project before the first answer of the month', () => {
    render(
      <PlanUsage
        planName="Hobby"
        projection={projectUsage({ used: 0, limit: 200, now: new Date('2026-09-20T00:00:00Z') })}
      />,
    );

    expect(screen.getByTestId('usage-projection')).toHaveTextContent(
      'No answers used yet this month.',
    );
  });
});
