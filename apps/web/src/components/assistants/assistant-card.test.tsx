import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AssistantCard, timeAgo } from './assistant-card';

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 8, 23, 12);

afterEach(cleanup);

describe('timeAgo', () => {
  it('rounds to the coarsest unit that reads naturally', () => {
    expect(timeAgo(new Date(NOW - 2 * 3_600_000).toISOString(), NOW)).toBe('today');
    expect(timeAgo(new Date(NOW - DAY_MS).toISOString(), NOW)).toBe('yesterday');
    expect(timeAgo(new Date(NOW - 3 * DAY_MS).toISOString(), NOW)).toBe('3 days ago');
    expect(timeAgo(new Date(NOW - 45 * DAY_MS).toISOString(), NOW)).toBe('last month');
    expect(timeAgo(new Date(NOW - 100 * DAY_MS).toISOString(), NOW)).toBe('3 months ago');
    expect(timeAgo(new Date(NOW - 800 * DAY_MS).toISOString(), NOW)).toBe('2 years ago');
  });
});

describe('AssistantCard', () => {
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
    expect(screen.getByText('Created today')).toBeInTheDocument();
  });
});
