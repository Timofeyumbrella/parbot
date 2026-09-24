import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { threadKey } from '@/lib/chat/queries';
import { beginExchange, emptyThread, type MessageRow, type Thread, threadFromRows } from '@/lib/chat/thread';

import { useFeedback, useThread } from './use-thread';

const db = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
  select: vi.fn(),
}));

const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: () => ({
      select: (columns: string) => {
        db.select(columns);

        return {
          eq: () => ({
            order: async () => ({ data: db.rows, error: db.error }),
          }),
        };
      },
    }),
  }),
}));

const CONVERSATION = '22222222-2222-4222-8222-222222222222';

const rows: MessageRow[] = [
  { id: 'u1', role: 'user', content: 'q', citations: [], answered: null, feedback: null, created_at: 't1', latency_ms: null },
  { id: 'a1', role: 'assistant', content: 'a', citations: [], answered: true, feedback: null, created_at: 't2', latency_ms: 300 },
];

let queryClient: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  db.rows = rows;
  db.error = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useThread', () => {
  it('reads the messages through the browser client when nothing is cached', async () => {
    const { result } = renderHook(() => useThread(CONVERSATION), { wrapper });

    expect(result.current.data).toBeUndefined();

    await waitFor(() => {
      expect(result.current.data?.messages.map((message) => message.id)).toEqual(['u1', 'a1']);
    });
    expect(db.select).toHaveBeenCalledWith('id, role, content, citations, answered, feedback, created_at, latency_ms');
    expect(result.current.data?.messages.every((message) => message.status === 'complete')).toBe(true);
  });

  it('renders straight from the cache and does not fetch while an answer streams', () => {
    queryClient.setQueryData<Thread>(
      threadKey(CONVERSATION),
      beginExchange(emptyThread(), { userId: 'tmp_u', assistantId: 'tmp_a', content: 'q' }),
    );

    const { result } = renderHook(() => useThread(CONVERSATION), { wrapper });

    expect(result.current.data?.messages).toHaveLength(2);
    expect(result.current.isFetching).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('surfaces a read failure', async () => {
    db.error = { message: 'permission denied' };

    const { result } = renderHook(() => useThread(CONVERSATION), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toMatchObject({ message: 'permission denied' });
  });
});

describe('useFeedback', () => {
  it('updates the cache first and keeps it when the server agrees', async () => {
    queryClient.setQueryData<Thread>(threadKey(CONVERSATION), threadFromRows(rows));

    const fetch = vi.fn(async () => Response.json({ id: 'a1', feedback: 1 }));

    vi.stubGlobal('fetch', fetch);

    const { result } = renderHook(() => useFeedback(CONVERSATION), { wrapper });

    let pending: Promise<void> | undefined;

    act(() => {
      pending = result.current('a1', 1);
    });

    expect(queryClient.getQueryData<Thread>(threadKey(CONVERSATION))?.messages[1]!.feedback).toBe(1);
    await act(async () => {
      await pending;
    });

    expect(fetch).toHaveBeenCalledWith('/api/messages/a1/feedback', expect.objectContaining({ method: 'POST', body: '{"value":1}' }));
    expect(queryClient.getQueryData<Thread>(threadKey(CONVERSATION))?.messages[1]!.feedback).toBe(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('rolls back and explains when the server refuses', async () => {
    queryClient.setQueryData<Thread>(threadKey(CONVERSATION), threadFromRows(rows));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'That message does not exist.' }, { status: 404 })),
    );

    const { result } = renderHook(() => useFeedback(CONVERSATION), { wrapper });

    await act(async () => {
      await result.current('a1', -1);
    });

    expect(queryClient.getQueryData<Thread>(threadKey(CONVERSATION))?.messages[1]!.feedback).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('That message does not exist.');
  });
});
