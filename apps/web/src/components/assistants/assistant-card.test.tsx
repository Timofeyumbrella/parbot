import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatDate } from '@/lib/format';

import { AssistantCard, type AssistantCardData } from './assistant-card';

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 8, 23, 12);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const card = (createdAt: string): AssistantCardData => ({
  id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  name: 'Acme Docs',
  slug: 'acme-docs',
  createdAt,
  pagesIndexed: 8,
  conversationsLast30Days: 13,
});

describe('AssistantCard', () => {
  it('reads the creation time the way every other screen does', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const fiveHoursAgo = new Date(NOW - 5 * 3_600_000).toISOString();
    const lastMonth = new Date(NOW - 30 * DAY_MS).toISOString();

    const { rerender } = render(<AssistantCard assistant={card(fiveHoursAgo)} />);

    expect(screen.getByText('5 hr ago')).toHaveAttribute('datetime', fiveHoursAgo);
    expect(screen.getByText(/^Created/)).toHaveTextContent('Created 5 hr ago');

    // Past a week relativeTime switches to the date, as the inbox and knowledge lists do.
    rerender(<AssistantCard assistant={card(lastMonth)} />);

    expect(screen.getByText(/^Created/)).toHaveTextContent(`Created ${formatDate(lastMonth)}`);
  });

  it('shows the name as a link to the assistant, the slug and both counts', () => {
    render(
      <AssistantCard
        assistant={{
          id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
          name: 'Acme Docs',
          slug: 'acme-docs',
          createdAt: new Date().toISOString(),
          pagesIndexed: 1,
          conversationsLast30Days: 1200,
        }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Acme Docs' })).toHaveAttribute(
      'href',
      '/a/3fa85f64-5717-4562-b3fc-2c963f66afa6',
    );
    expect(screen.getByText('acme-docs')).toBeInTheDocument();
    expect(screen.getByText('page indexed')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
    expect(screen.getByText('conversations in 30 days')).toBeInTheDocument();
    expect(screen.getByText(/^Created/)).toHaveTextContent('Created just now');
  });
});
