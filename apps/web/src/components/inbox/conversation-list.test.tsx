import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createContext, useContext, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { conversationListKey, type ConversationRow } from './conversation-query';
import { applyChange, ConversationList, type ListData } from './conversation-list';

// The list subscribes to Realtime once the session is ready; these tests drive the cache directly.
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ removeChannel: vi.fn() }),
  realtimeReadyClient: () => new Promise(() => {}),
}));

// Next's Link reports `pending` from the click until the route lands. This one stays pending once
// clicked, the way a link does while the router waits for a route it has not prefetched.
vi.mock('next/link', () => {
  const Status = createContext({ pending: false });

  const Link = ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => {
    const [pending, setPending] = useState(false);

    return (
      <Status.Provider value={{ pending }}>
        <a
          href={href}
          onClick={(event) => {
            event.preventDefault();
            setPending(true);
          }}
          {...rest}
        >
          {children}
        </a>
      </Status.Provider>
    );
  };

  return { default: Link, useLinkStatus: () => useContext(Status) };
});

const row = (overrides: Partial<ConversationRow> = {}): ConversationRow => ({
  id: crypto.randomUUID(),
  title: 'How do I rotate keys?',
  channel: 'app',
  page_url: null,
  message_count: 2,
  unanswered_count: 0,
  last_message_at: '2026-09-23T10:00:00Z',
  created_at: '2026-09-23T09:59:00Z',
  ...overrides,
});

const list = (...pages: ConversationRow[][]): ListData => ({
  pages: pages.map((rows) => ({ rows, cursor: null })),
  pageParams: pages.map(() => null),
});

type Payload = RealtimePostgresChangesPayload<ConversationRow>;

const insert = (next: ConversationRow): Payload =>
  ({
    eventType: 'INSERT',
    new: next,
    old: {},
    schema: 'public',
    table: 'conversations',
    commit_timestamp: '',
    errors: [],
  }) as Payload;

const update = (next: ConversationRow): Payload =>
  ({
    eventType: 'UPDATE',
    new: next,
    old: { id: next.id },
    schema: 'public',
    table: 'conversations',
    commit_timestamp: '',
    errors: [],
  }) as Payload;

const remove = (id: string): Payload =>
  ({
    eventType: 'DELETE',
    new: {},
    old: { id },
    schema: 'public',
    table: 'conversations',
    commit_timestamp: '',
    errors: [],
  }) as Payload;

const ids = (data: ListData) => data.pages.flatMap((page) => page.rows.map((item) => item.id));

const NOW = Date.parse('2026-09-23T12:00:00Z');

const renderList = (initialRows: ConversationRow[]) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ConversationList assistantId="asst" filter="all" initialRows={initialRows} now={NOW} />
    </QueryClientProvider>,
  );

  return queryClient;
};

const shownIds = () =>
  screen.getAllByRole('listitem').map((item) => item.getAttribute('data-conversation-id'));

describe('ConversationList', () => {
  it('shows rows in the order the server pages them, a row without a message last', async () => {
    // Started most recently but never had a message: sorting by start time would lift it to the top.
    const queryClient = renderList([
      row({ id: 'b', last_message_at: '2026-09-23T11:00:00+00:00' }),
      row({ id: 'a', last_message_at: '2026-09-23T10:00:00+00:00' }),
      row({ id: 'z', last_message_at: null, created_at: '2026-09-23T11:59:00+00:00' }),
    ]);

    expect(shownIds()).toEqual(['b', 'a', 'z']);
    // It still shows when it was started, the only activity it has.
    expect(screen.getByText('1 min ago')).toBeInTheDocument();

    // Its first message arrives over Realtime and only then does it move to the top.
    queryClient.setQueryData<ListData>(conversationListKey('asst', 'all'), (data) =>
      data
        ? applyChange(
            data,
            update(row({ id: 'z', last_message_at: '2026-09-23T11:59:30+00:00' })),
            'all',
          ).data
        : data,
    );

    // TanStack Query notifies observers on the next tick.
    await waitFor(() => expect(shownIds()).toEqual(['z', 'b', 'a']));
  });
});

describe('ConversationList rows', () => {
  it('marks a clicked row as opening before the route lands', async () => {
    const user = userEvent.setup();

    renderList([row({ id: 'a', title: 'Rotate keys' }), row({ id: 'b', title: 'Webhooks' })]);

    const clicked = screen.getByRole('link', { name: /Webhooks/ });

    expect(clicked.querySelector('[data-pending]')).toBeNull();

    await user.click(clicked);

    expect(clicked.querySelector('[data-pending]')).not.toBeNull();
    expect(clicked).toHaveClass('has-data-pending:bg-muted');
    expect(screen.getByRole('link', { name: /Rotate keys/ }).querySelector('[data-pending]')).toBeNull();
  });
});

describe('applyChange', () => {
  it('prepends an inserted row that fits the filter and reports it as new', () => {
    const existing = row({ id: 'old' });
    const fresh = row({ id: 'fresh', channel: 'widget', page_url: 'https://docs.example.com/a' });

    const all = applyChange(list([existing]), insert(fresh), 'all');
    expect(ids(all.data)).toEqual(['fresh', 'old']);
    expect(all.added).toBe('fresh');

    const widget = applyChange(list([existing]), insert(fresh), 'widget');
    expect(ids(widget.data)).toEqual(['fresh', 'old']);
  });

  it('ignores an inserted row that does not belong in the open filter', () => {
    const data = list([row({ id: 'old' })]);
    const result = applyChange(data, insert(row({ id: 'fresh', channel: 'app' })), 'widget');

    expect(result.data).toBe(data);
    expect(result.added).toBeNull();
  });

  it('updates a known row in place without marking it new', () => {
    const data = list([row({ id: 'a', message_count: 2 })], [row({ id: 'b', message_count: 4 })]);
    const result = applyChange(
      data,
      update(row({ id: 'b', message_count: 5, last_message_at: '2026-09-23T11:00:00Z' })),
      'all',
    );

    expect(result.added).toBeNull();
    expect(result.data.pages[1]?.rows[0]).toMatchObject({
      id: 'b',
      message_count: 5,
      last_message_at: '2026-09-23T11:00:00Z',
    });
    expect(ids(result.data)).toEqual(['a', 'b']);
  });

  it('drops a known row once an update moves it out of the filter', () => {
    const data = list([
      row({ id: 'a', unanswered_count: 1 }),
      row({ id: 'b', unanswered_count: 2 }),
    ]);
    const result = applyChange(data, update(row({ id: 'a', unanswered_count: 0 })), 'unanswered');

    expect(ids(result.data)).toEqual(['b']);
  });

  it('adds a row the update makes eligible for the filter', () => {
    const data = list([row({ id: 'b', unanswered_count: 2 })]);
    const result = applyChange(data, update(row({ id: 'a', unanswered_count: 1 })), 'unanswered');

    expect(ids(result.data)).toEqual(['a', 'b']);
    expect(result.added).toBe('a');
  });

  it('removes a deleted row and leaves the data untouched when the row is unknown', () => {
    const data = list([row({ id: 'a' }), row({ id: 'b' })]);

    expect(ids(applyChange(data, remove('a'), 'all').data)).toEqual(['b']);
    expect(applyChange(data, remove('zzz'), 'all').data).toBe(data);
    expect(applyChange(data, remove(''), 'all').data).toBe(data);
  });
});
