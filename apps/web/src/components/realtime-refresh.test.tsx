import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

const realtime = vi.hoisted(() => ({
  ready: null as null | (() => void),
  on: vi.fn(),
  subscribe: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock('@/lib/supabase/client', () => {
  const client = {
    channel: () => {
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

import { REFRESH_GAP_MS, RealtimeRefresh } from './realtime-refresh';

const change = () => (realtime.on.mock.calls[0]![2] as () => void)();

describe('RealtimeRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('joins once the session is loaded and re-renders the page when a watched row changes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { unmount } = render(
      <RealtimeRefresh
        name="inbox:transcript:c1"
        watch={[
          { table: 'messages', filter: 'conversation_id=eq.c1' },
          { table: 'conversations', filter: 'id=eq.c1' },
        ]}
      />,
    );

    expect(realtime.subscribe).not.toHaveBeenCalled();

    await act(async () => {
      realtime.ready?.();
    });

    expect(realtime.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: 'conversation_id=eq.c1' },
      expect.any(Function),
    );
    expect(realtime.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversations', filter: 'id=eq.c1' },
      expect.any(Function),
    );

    change();
    await vi.advanceTimersByTimeAsync(0);
    expect(router.refresh).toHaveBeenCalledTimes(1);

    const status = realtime.subscribe.mock.calls[0]![0] as (status: string) => void;

    status('CHANNEL_ERROR');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('CHANNEL_ERROR'), '');

    unmount();
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('turns a burst of changes into one refresh a second', async () => {
    render(
      <RealtimeRefresh
        name="overview:a1"
        watch={[{ table: 'conversations', filter: 'assistant_id=eq.a1' }]}
      />,
    );

    await act(async () => {
      realtime.ready?.();
    });

    change();
    await vi.advanceTimersByTimeAsync(0);
    expect(router.refresh).toHaveBeenCalledTimes(1);

    // A question and the counters it bumps arrive together.
    change();
    change();
    change();
    await vi.advanceTimersByTimeAsync(REFRESH_GAP_MS - 1);
    expect(router.refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });
});
