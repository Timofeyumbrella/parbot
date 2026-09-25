import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationRow } from '@/lib/chat/conversations';
import { conversationsKey, threadKey } from '@/lib/chat/queries';

import {
  resetAppliedSnapshots,
  useConversationActions,
  useConversations,
  useConversationsRealtime,
} from './use-conversations';

const db = vi.hoisted(() => ({
  rows: [] as unknown[],
  select: vi.fn(),
}));

const realtime = vi.hoisted(() => ({
  ready: null as null | (() => void),
  on: vi.fn(),
  subscribe: vi.fn(),
  removeChannel: vi.fn(),
  channelNames: [] as string[],
}));

const actions = vi.hoisted(() => ({
  renameConversation: vi.fn(
    async () => ({ ok: true }) as { ok: true } | { ok: false; error: string },
  ),
  deleteConversation: vi.fn(
    async () => ({ ok: true }) as { ok: true } | { ok: false; error: string },
  ),
}));

const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('sonner', () => ({ toast }));
vi.mock('@/actions/conversations', () => actions);

vi.mock('@/lib/supabase/client', () => {
  const client = {
    from: () => ({
      select: (columns: string) => {
        db.select(columns);

        return {
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: db.rows, error: null }),
              }),
            }),
          }),
        };
      },
    }),
    channel: (name: string) => {
      realtime.channelNames.push(name);

      const channel = {
        on: (...args: unknown[]) => {
          realtime.on(...args);

          return channel;
        },
        subscribe: (callback: (status: string) => void) => {
          realtime.subscribe(callback);

          return channel;
        },
      };

      return channel;
    },
    removeChannel: realtime.removeChannel,
  };

  return {
    getSupabaseBrowserClient: () => client,
    realtimeReadyClient: () =>
      new Promise<typeof client>((resolve) => {
        realtime.ready = () => resolve(client);
      }),
  };
});

const row = (id: string, at: string, extra: Partial<ConversationRow> = {}): ConversationRow => ({
  id,
  title: `Chat ${id}`,
  last_message_at: at,
  message_count: 2,
  unanswered_count: 0,
  ...extra,
});

let queryClient: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const cached = () => queryClient.getQueryData<ConversationRow[]>(conversationsKey('asst'));

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  resetAppliedSnapshots();
  db.rows = [];
  realtime.ready = null;
  realtime.channelNames = [];
});

describe('useConversations', () => {
  it('seeds the cache from the layout snapshot without a fetch', () => {
    const snapshot = { rows: [row('a', '2026-09-23T10:00:00Z')], fetchedAt: 1000 };
    const { result } = renderHook(() => useConversations('asst', snapshot), { wrapper });

    expect(result.current.data?.map((item) => item.id)).toEqual(['a']);
    expect(result.current.isFetching).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('keeps a chat started in the browser when an older snapshot comes back with the layout', async () => {
    // Regression: ask a question, open Knowledge, return to Chat. The router replays a payload read
    // before the new conversation existed; the list must not lose the row.
    const first = { rows: [row('old', '2026-09-23T09:00:00Z')], fetchedAt: 1000 };
    const { unmount } = renderHook(() => useConversations('asst', first), { wrapper });

    act(() => {
      queryClient.setQueryData<ConversationRow[]>(conversationsKey('asst'), (rows) => [
        row('started', '2026-09-23T11:00:00Z'),
        ...(rows ?? []),
      ]);
    });
    unmount();

    const { result } = renderHook(() => useConversations('asst', first), { wrapper });

    await waitFor(() => {
      expect(result.current.data?.map((item) => item.id)).toEqual(['started', 'old']);
    });
  });

  it('folds a newer snapshot in: new rows appear, cached rows the snapshot lacks stay', async () => {
    const first = { rows: [row('old', '2026-09-23T09:00:00Z')], fetchedAt: 1000 };
    const { unmount } = renderHook(() => useConversations('asst', first), { wrapper });

    act(() => {
      queryClient.setQueryData<ConversationRow[]>(conversationsKey('asst'), (rows) => [
        row('started', '2026-09-23T11:00:00Z'),
        ...(rows ?? []),
      ]);
    });
    unmount();

    const second = {
      rows: [
        row('elsewhere', '2026-09-23T12:00:00Z'),
        row('old', '2026-09-23T09:00:00Z', { title: 'Renamed elsewhere' }),
      ],
      fetchedAt: 2000,
    };
    const { result } = renderHook(() => useConversations('asst', second), { wrapper });

    await waitFor(() => {
      expect(result.current.data?.map((item) => item.id)).toEqual(['elsewhere', 'started', 'old']);
    });
    expect(result.current.data?.find((item) => item.id === 'old')?.title).toBe('Renamed elsewhere');
  });

  it('still reads the list again when another screen invalidated it before the snapshot lands', async () => {
    // Regression: a conversation deleted in the Inbox stayed in the Chat list. Folding the layout
    // snapshot in marked the list fresh, so the refetch the Inbox asked for never happened.
    queryClient.setQueryData<ConversationRow[]>(conversationsKey('asst'), [
      row('gone', '2026-09-23T11:00:00Z'),
      row('kept', '2026-09-23T10:00:00Z'),
    ]);
    await queryClient.invalidateQueries({ queryKey: ['chat'] });
    db.rows = [row('kept', '2026-09-23T10:00:00Z')];

    const snapshot = { rows: [row('kept', '2026-09-23T10:00:00Z')], fetchedAt: 5000 };
    const { result } = renderHook(() => useConversations('asst', snapshot), { wrapper });

    await waitFor(() => {
      expect(result.current.data?.map((item) => item.id)).toEqual(['kept']);
    });
    expect(db.select).toHaveBeenCalled();
  });

  it('lets a fresh read through the browser client drop rows deleted elsewhere', async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
    queryClient.setQueryData<ConversationRow[]>(conversationsKey('asst'), [
      row('gone', '2026-09-23T11:00:00Z'),
      row('mine', '2026-09-23T12:00:00Z', { pending: true }),
    ]);
    db.rows = [row('kept', '2026-09-23T10:00:00Z')];

    const { result } = renderHook(() => useConversations('asst'), { wrapper });

    await waitFor(() => {
      expect(result.current.data?.map((item) => item.id)).toEqual(['mine', 'kept']);
    });
  });
});

describe('useConversationsRealtime', () => {
  it('joins only once the session is loaded and warns when the join fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { unmount } = renderHook(() => useConversationsRealtime('asst'), { wrapper });

    expect(realtime.subscribe).not.toHaveBeenCalled();

    await act(async () => {
      realtime.ready?.();
    });

    expect(realtime.channelNames[0]).toMatch(/^chat:conversations:asst:/);
    expect(realtime.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'conversations', filter: 'assistant_id=eq.asst' }),
      expect.any(Function),
    );

    const status = realtime.subscribe.mock.calls[0]![0] as (status: string, error?: Error) => void;

    status('SUBSCRIBED');
    expect(warn).not.toHaveBeenCalled();
    status('CHANNEL_ERROR', new Error('invalid column for filter'));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('CHANNEL_ERROR'),
      'invalid column for filter',
    );

    unmount();
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('applies title changes from the database to the list', async () => {
    queryClient.setQueryData<ConversationRow[]>(conversationsKey('asst'), [
      row('a', '2026-09-23T10:00:00Z', { title: null }),
    ]);
    renderHook(() => useConversationsRealtime('asst'), { wrapper });

    await act(async () => {
      realtime.ready?.();
    });

    const handler = realtime.on.mock.calls[0]![2] as (payload: unknown) => void;

    act(() => {
      handler({
        eventType: 'UPDATE',
        new: {
          id: 'a',
          channel: 'app',
          title: 'Named by the engine',
          last_message_at: '2026-09-23T10:00:00Z',
          message_count: 2,
          unanswered_count: 0,
        },
        old: {},
      });
    });

    expect(cached()?.[0]).toMatchObject({ title: 'Named by the engine', pending: false });
  });
});

describe('useConversationActions', () => {
  it('removes the row and its thread at once, then tells the inbox to refetch', async () => {
    queryClient.setQueryData<ConversationRow[]>(conversationsKey('asst'), [
      row('a', '2026-09-23T10:00:00Z'),
      row('b', '2026-09-23T09:00:00Z'),
    ]);
    queryClient.setQueryData(threadKey('a'), { messages: [], active: null });

    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useConversationActions('asst'), { wrapper });

    let pending: Promise<boolean> | undefined;

    act(() => {
      pending = result.current.remove('a');
    });

    expect(cached()?.map((item) => item.id)).toEqual(['b']);
    expect(queryClient.getQueryData(threadKey('a'))).toBeUndefined();

    await act(async () => {
      await pending;
    });

    expect(actions.deleteConversation).toHaveBeenCalledWith({ id: 'a' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inbox'] });
  });

  it('puts the row and the thread back when the delete fails', async () => {
    actions.deleteConversation.mockResolvedValueOnce({
      ok: false,
      error: 'That conversation no longer exists.',
    });
    queryClient.setQueryData<ConversationRow[]>(conversationsKey('asst'), [
      row('a', '2026-09-23T10:00:00Z'),
    ]);
    queryClient.setQueryData(threadKey('a'), { messages: [], active: null });

    const { result } = renderHook(() => useConversationActions('asst'), { wrapper });

    await act(async () => {
      await result.current.remove('a');
    });

    expect(cached()?.map((item) => item.id)).toEqual(['a']);
    expect(queryClient.getQueryData(threadKey('a'))).toEqual({ messages: [], active: null });
    expect(toast.error).toHaveBeenCalledWith('That conversation no longer exists.');
  });

  it('renames optimistically and tells the inbox', async () => {
    queryClient.setQueryData<ConversationRow[]>(conversationsKey('asst'), [
      row('a', '2026-09-23T10:00:00Z'),
    ]);

    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useConversationActions('asst'), { wrapper });

    await act(async () => {
      await result.current.rename('a', '  Key rotation  ');
    });

    expect(cached()?.[0]?.title).toBe('Key rotation');
    expect(actions.renameConversation).toHaveBeenCalledWith({ id: 'a', title: 'Key rotation' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inbox'] });
  });
});
