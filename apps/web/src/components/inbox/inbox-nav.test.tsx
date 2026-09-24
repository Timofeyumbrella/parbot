import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { inboxCountsKey } from './conversation-query';
import { ConversationFilters, InboxTabs } from './inbox-nav';
import { PendingNav } from './pending-nav';

const NOW = new Date('2026-09-23T12:00:00Z').getTime();

const renderWith = (client: QueryClient, ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={client}>
      <PendingNav>{ui}</PendingNav>
    </QueryClientProvider>,
  );

describe('InboxTabs', () => {
  it('links both tabs, marks the open one and shows the counts', () => {
    renderWith(new QueryClient(), <InboxTabs assistantId="a1" tab="leads" counts={{ conversations: 1234, leads: 3 }} now={NOW} />);

    const conversations = screen.getByRole('link', { name: /Conversations/ });
    const leads = screen.getByRole('link', { name: /Leads/ });

    expect(conversations).toHaveAttribute('href', '/a/a1/inbox');
    expect(leads).toHaveAttribute('href', '/a/a1/inbox?tab=leads');
    expect(leads).toHaveAttribute('aria-current', 'page');
    expect(conversations).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('conversations-count')).toHaveTextContent('1,234');
    expect(screen.getByTestId('leads-count')).toHaveTextContent('3');
  });

  it('follows the shared count in the query cache, as the list updates it on Realtime inserts', async () => {
    const client = new QueryClient();
    renderWith(client, <InboxTabs assistantId="a1" tab="conversations" counts={{ conversations: 8, leads: 0 }} now={NOW} />);

    expect(screen.getByTestId('conversations-count')).toHaveTextContent('8');

    act(() => {
      client.setQueryData(inboxCountsKey('a1'), { conversations: 9, leads: 0 });
    });

    await waitFor(() => expect(screen.getByTestId('conversations-count')).toHaveTextContent('9'));
  });

  it('lets a fresh server render replace a stale cached count', async () => {
    const client = new QueryClient();
    client.setQueryData(inboxCountsKey('a1'), { conversations: 2, leads: 0 }, { updatedAt: NOW - 60_000 });

    renderWith(client, <InboxTabs assistantId="a1" tab="conversations" counts={{ conversations: 5, leads: 1 }} now={NOW} />);

    await waitFor(() => expect(screen.getByTestId('conversations-count')).toHaveTextContent('5'));
    expect(screen.getByTestId('leads-count')).toHaveTextContent('1');
  });
});

describe('ConversationFilters', () => {
  it('links every filter, leaving the default out of the URL', () => {
    renderWith(new QueryClient(), <ConversationFilters assistantId="a1" filter="widget" />);

    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute('href', '/a/a1/inbox');
    expect(screen.getByRole('link', { name: 'Widget' })).toHaveAttribute('href', '/a/a1/inbox?filter=widget');
    expect(screen.getByRole('link', { name: 'In-app' })).toHaveAttribute('href', '/a/a1/inbox?filter=app');
    expect(screen.getByRole('link', { name: 'Unanswered' })).toHaveAttribute('href', '/a/a1/inbox?filter=unanswered');
    expect(screen.getByRole('link', { name: 'Widget' })).toHaveAttribute('aria-current', 'page');
  });
});
