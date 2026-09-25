import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetAppliedSnapshots } from '@/hooks/use-conversations';
import { type ConversationRow } from '@/lib/chat/conversations';
import { conversationsKey } from '@/lib/chat/queries';

import { ConversationList } from './conversation-list';

const navigation = vi.hoisted(() => ({
  params: { assistantId: 'asst', conversationId: undefined as string | undefined },
  push: vi.fn(),
}));

const actions = vi.hoisted(() => ({
  renameConversation: vi.fn(
    async () => ({ ok: true }) as { ok: true } | { ok: false; error: string },
  ),
  deleteConversation: vi.fn(
    async () => ({ ok: true }) as { ok: true } | { ok: false; error: string },
  ),
}));

vi.mock('next/navigation', () => ({
  useParams: () => navigation.params,
  useRouter: () => ({ push: navigation.push, prefetch: vi.fn() }),
}));

vi.mock('@/actions/conversations', () => actions);
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({}),
  realtimeReadyClient: () => new Promise(() => {}),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const NOW = Date.parse('2026-09-23T12:00:00.000Z');

const rows: ConversationRow[] = [
  {
    id: 'c1',
    title: 'Rotate an API key',
    last_message_at: '2026-09-23T11:55:00.000Z',
    message_count: 4,
    unanswered_count: 0,
  },
  {
    id: 'c2',
    title: null,
    last_message_at: '2026-09-23T09:00:00.000Z',
    message_count: 2,
    unanswered_count: 1,
  },
  {
    id: 'c3',
    title: 'Webhook signatures',
    last_message_at: '2026-09-21T09:00:00.000Z',
    message_count: 2,
    unanswered_count: 0,
  },
];

let queryClient: QueryClient;

const renderList = (initial = rows) => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ConversationList assistantId="asst" snapshot={{ rows: initial, fetchedAt: NOW }} />
    </QueryClientProvider>,
  );
};

const cached = () => queryClient.getQueryData<ConversationRow[]>(conversationsKey('asst'));

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  navigation.params.conversationId = undefined;
  resetAppliedSnapshots();
});

describe('ConversationList', () => {
  it('lists the rows newest first with a label, a relative time and an unanswered dot', () => {
    navigation.params.conversationId = 'c2';
    renderList();

    const items = within(screen.getByRole('navigation', { name: 'Conversations' })).getAllByRole(
      'listitem',
    );

    expect(items.map((item) => within(item).getByRole('link').textContent)).toEqual([
      'Rotate an API key5 min ago',
      'New chat3 hr ago',
      'Webhook signatures2 days ago',
    ]);
    expect(within(items[1]!).getByLabelText('1 unanswered')).toBeInTheDocument();
    expect(within(items[1]!).getByRole('link')).toHaveAttribute('aria-current', 'page');
    expect(within(items[0]!).getByRole('link')).toHaveAttribute('href', '/a/asst/chat/c1');
    expect(screen.getByRole('link', { name: 'New chat' })).toHaveAttribute('href', '/a/asst/chat');
  });

  it('says what to do when there are no conversations', () => {
    renderList([]);

    expect(screen.getByText(/No conversations yet/)).toBeInTheDocument();
  });

  it('filters by title, focuses on Cmd+K and clears on Escape', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderList();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const filter = screen.getByRole('searchbox', { name: 'Filter conversations' });

    expect(filter).toHaveFocus();

    await user.type(filter, 'webhook');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Webhook signatures')).toBeInTheDocument();

    await user.type(filter, 'zzz');
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(filter).toHaveValue('');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renames inline and updates the cache before the action resolves', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderList();

    await user.click(screen.getByRole('button', { name: 'Actions for Rotate an API key' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByRole('textbox', { name: 'Conversation title' });

    expect(input).toHaveValue('Rotate an API key');
    await user.clear(input);
    await user.type(input, 'Key rotation{Enter}');

    expect(screen.getByText('Key rotation')).toBeInTheDocument();
    expect(cached()?.find((row) => row.id === 'c1')?.title).toBe('Key rotation');
    expect(actions.renameConversation).toHaveBeenCalledWith({ id: 'c1', title: 'Key rotation' });
  });

  it('rolls a rename back when the action fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    actions.renameConversation.mockResolvedValueOnce({ ok: false, error: 'No.' });
    renderList();

    await user.click(screen.getByRole('button', { name: 'Actions for Webhook signatures' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    await user.type(screen.getByRole('textbox', { name: 'Conversation title' }), ' v2{Enter}');

    await vi.waitFor(() => {
      expect(cached()?.find((row) => row.id === 'c3')?.title).toBe('Webhook signatures');
    });
  });

  it('asks before deleting, then removes the row and leaves the open conversation', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    navigation.params.conversationId = 'c1';
    renderList();

    await user.click(screen.getByRole('button', { name: 'Actions for Rotate an API key' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete conversation' });

    expect(dialog).toHaveTextContent('Rotate an API key');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(cached()?.map((row) => row.id)).toEqual(['c2', 'c3']);
    expect(actions.deleteConversation).toHaveBeenCalledWith({ id: 'c1' });
    expect(navigation.push).toHaveBeenCalledWith('/a/asst/chat');
    // The action is dispatched before the navigation, so the router lets the navigation take priority.
    expect(actions.deleteConversation.mock.invocationCallOrder[0]).toBeLessThan(
      navigation.push.mock.invocationCallOrder[0]!,
    );
  });

  it('does not leave a conversation that is not the open one when it is deleted', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    navigation.params.conversationId = 'c1';
    renderList();

    await user.click(screen.getByRole('button', { name: 'Actions for Webhook signatures' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );

    expect(cached()?.map((row) => row.id)).toEqual(['c1', 'c2']);
    expect(navigation.push).not.toHaveBeenCalled();
  });
});
