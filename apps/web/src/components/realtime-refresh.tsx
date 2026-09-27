'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { getSupabaseBrowserClient, realtimeReadyClient } from '@/lib/supabase/client';

export type RealtimeWatch = {
  table: 'conversations' | 'messages' | 'leads' | 'sources';
  /** A postgres_changes filter such as `conversation_id=eq.<id>`. */
  filter: string;
};

/** A burst of changes (a message, then the counters it bumps) becomes one server render. */
export const REFRESH_GAP_MS = 1000;

/**
 * Re-renders the current page on the server whenever a watched row changes, so a screen read
 * once on the server (a transcript, the Overview) follows what visitors do while it is open.
 * router.refresh() keeps client state and clears only this route's cache, so the prefetched
 * routes the sidebar relies on survive.
 */
export const RealtimeRefresh = ({ name, watch }: { name: string; watch: RealtimeWatch[] }) => {
  const router = useRouter();
  // The list is rebuilt on every server render; its content decides when to rejoin.
  const tables = JSON.stringify(watch);

  useEffect(() => {
    const watched = JSON.parse(tables) as RealtimeWatch[];
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = 0;

    const refresh = () => {
      if (timer) {
        return;
      }

      const wait = last + REFRESH_GAP_MS - Date.now();

      timer = setTimeout(
        () => {
          timer = null;
          last = Date.now();
          router.refresh();
        },
        Math.max(wait, 0),
      );
    };

    void realtimeReadyClient().then((supabase) => {
      if (cancelled) {
        return;
      }

      const next = supabase.channel(`${name}:${Math.random().toString(36).slice(2)}`);

      for (const { table, filter } of watched) {
        next.on('postgres_changes', { event: '*', schema: 'public', table, filter }, refresh);
      }

      channel = next.subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(
            `${name}: the live updates channel did not join (${status}).`,
            error?.message ?? '',
          );
        }
      });
    });

    return () => {
      cancelled = true;

      if (timer) {
        clearTimeout(timer);
      }

      if (channel) {
        void getSupabaseBrowserClient().removeChannel(channel);
      }
    };
  }, [name, tables, router]);

  return null;
};
