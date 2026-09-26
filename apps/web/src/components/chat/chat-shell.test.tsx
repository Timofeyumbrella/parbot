import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetAppliedSnapshots } from '@/hooks/use-conversations';
import type { ConversationRow } from '@/lib/chat/conversations';

const navigation = vi.hoisted(() => ({
  params: { assistantId: 'asst', conversationId: 'c1' as string | undefined },
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => navigation.params,
  useRouter: () => ({ push: navigation.push }),
}));

// The router is not under test: a click only reaches the link's own handler, as it does while the
// real router is still waiting for the server.
vi.mock('next/link', () => ({
  default: ({
    href,
    onClick,
    children,
    prefetch,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
    <a
      href={href}
      data-prefetch={prefetch === false ? 'off' : undefined}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

vi.mock('@/components/chat/thread', () => ({
  Thread: ({ conversationId }: { conversationId: string }) => (
    <div data-testid="thread" data-conversation={conversationId} />
  ),
}));
const newChatMounts = vi.hoisted(() => ({ count: 0 }));

vi.mock('@/components/chat/new-chat', async () => {
  const { useState } = await import('react');

  return {
    // Numbers each mount, so a test can tell a blank screen from the one it replaced.
    NewChat: () => {
      const [mount] = useState(() => ++newChatMounts.count);

      return <div data-testid="new-chat" data-mount={mount} />;
    },
  };
});
vi.mock('@/actions/conversations', () => ({
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ order: () => new Promise(() => {}) }) }),
    }),
    removeChannel: vi.fn(),
  }),
  realtimeReadyClient: () => new Promise(() => {}),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { ChatShell } from './chat-shell';
import { ConversationList } from './conversation-list';

const rows: ConversationRow[] = ['c1', 'c2', 'c3'].map((id, index) => ({
  id,
  title: `Chat ${id}`,
  last_message_at: `2026-09-23T1${5 - index}:00:00.000Z`,
  message_count: 2,
  unanswered_count: 0,
}));

let queryClient: QueryClient;

const Shell = ({ page }: { page: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <ChatShell
      assistantId="asst"
      list={<ConversationList assistantId="asst" snapshot={{ rows, fetchedAt: 1000 }} />}
    >
      {page}
    </ChatShell>
  </QueryClientProvider>
);

const list = () => within(screen.getAllByRole('navigation', { name: 'Conversations' })[0]!);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  navigation.params.conversationId = 'c1';
  resetAppliedSnapshots();
});

describe('ChatShell', () => {
  it('opens a clicked conversation in the click frame, before the route has moved', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Shell page={<p>page for c1</p>} />);

    expect(list().getByRole('link', { name: /Chat c1/ })).toHaveAttribute('aria-current', 'page');
    // The rows do not need the route prefetched, so they leave the prefetch queue to the sidebar.
    expect(list().getByRole('link', { name: /Chat c3/ })).toHaveAttribute('data-prefetch', 'off');

    await user.click(list().getByRole('link', { name: /Chat c3/ }));

    // The route still says c1, yet the row and the pane have moved to c3.
    expect(list().getByRole('link', { name: /Chat c3/ })).toHaveAttribute('aria-current', 'page');
    expect(list().getByRole('link', { name: /Chat c1/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('thread')).toHaveAttribute('data-conversation', 'c3');
    expect(screen.queryByText('page for c1')).not.toBeInTheDocument();

    // The route lands; from then on the page it renders is shown again.
    navigation.params.conversationId = 'c3';
    rerender(<Shell page={<p>page for c3</p>} />);

    expect(screen.getByText('page for c3')).toBeInTheDocument();
    expect(list().getByRole('link', { name: /Chat c3/ })).toHaveAttribute('aria-current', 'page');

    // Back to c1 through the browser: the earlier click does not come back.
    navigation.params.conversationId = 'c1';
    rerender(<Shell page={<p>page for c1</p>} />);

    expect(screen.getByText('page for c1')).toBeInTheDocument();
    expect(list().getByRole('link', { name: /Chat c1/ })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the new chat at once and ignores a click on the open conversation', async () => {
    const user = userEvent.setup();
    render(<Shell page={<p>page for c1</p>} />);

    await user.click(list().getByRole('link', { name: /Chat c1/ }));
    expect(screen.getByText('page for c1')).toBeInTheDocument();

    await user.click(screen.getAllByRole('link', { name: 'New chat' })[0]!);
    expect(screen.getByTestId('new-chat')).toBeInTheDocument();
    expect(list().getByRole('link', { name: /Chat c1/ })).not.toHaveAttribute('aria-current');
  });

  it('starts a blank chat on the new chat route while a chat just started there waits for its URL', async () => {
    const user = userEvent.setup();

    // The new chat page has sent its first message and shows that thread; the router is still
    // fetching the chat's own URL, so the route says "new chat".
    navigation.params.conversationId = undefined;
    render(<Shell page={<p>thread of the chat just started</p>} />);

    await user.click(screen.getAllByRole('link', { name: 'New chat' })[0]!);

    expect(screen.queryByText('thread of the chat just started')).not.toBeInTheDocument();

    const first = screen.getByTestId('new-chat');

    // Another click starts over again rather than keeping what the last one showed.
    await user.click(screen.getAllByRole('link', { name: 'New chat' })[0]!);

    expect(screen.getByTestId('new-chat')).not.toHaveAttribute(
      'data-mount',
      first.getAttribute('data-mount'),
    );
  });

  it('leaves a modified click to the browser', async () => {
    const user = userEvent.setup();
    render(<Shell page={<p>page for c1</p>} />);

    await user.keyboard('{Meta>}');
    await user.click(list().getByRole('link', { name: /Chat c2/ }));
    await user.keyboard('{/Meta}');

    expect(screen.getByText('page for c1')).toBeInTheDocument();
  });
});
