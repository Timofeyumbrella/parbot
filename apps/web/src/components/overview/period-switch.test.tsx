import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { PendingNav } from '@/components/inbox/pending-nav';
import { parseDays } from '@/lib/analytics';

import { PeriodSwitch } from './period-switch';

const renderSwitch = (query: string | undefined) =>
  render(
    <PendingNav>
      <PeriodSwitch assistantId="a1" days={parseDays(query)} />
    </PendingNav>,
  );

describe('PeriodSwitch', () => {
  it('opens on the week, linked without a query so it is the same page as the sidebar link', () => {
    renderSwitch(undefined);

    const week = screen.getByRole('link', { name: '7 days' });
    const month = screen.getByRole('link', { name: '30 days' });

    expect(week).toHaveAttribute('aria-current', 'page');
    expect(week).toHaveAttribute('href', '/a/a1');
    expect(month).not.toHaveAttribute('aria-current');
    expect(month).toHaveAttribute('href', '/a/a1?days=30');
  });

  it('marks the 30-day link current when the URL asks for it', () => {
    renderSwitch('30');

    expect(screen.getByRole('link', { name: '30 days' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '7 days' })).not.toHaveAttribute('aria-current');
  });

  it('treats an explicit ?days=7 as the week', () => {
    renderSwitch('7');

    expect(screen.getByRole('link', { name: '7 days' })).toHaveAttribute('aria-current', 'page');
  });
});
