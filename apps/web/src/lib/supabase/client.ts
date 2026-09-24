'use client';

import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/lib/db/types';
import { publicEnv } from '@/lib/env';

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let client: BrowserClient | null = null;
let realtimeReady: Promise<void> | null = null;

/** A browser client that acts as the signed-in visitor. Row level security applies. */
export const getSupabaseBrowserClient = (): BrowserClient => {
  if (!client) {
    client = createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);

    // Realtime evaluates row level security with the token it holds when a channel joins. Keep it
    // in step with the session so a refreshed or ended session is reflected on open channels.
    client.auth.onAuthStateChange((_event, session) => {
      void client?.realtime.setAuth(session?.access_token ?? null);
    });
  }

  return client;
};

/**
 * Resolves to the browser client once the visitor's session is loaded and Realtime carries its
 * token. Subscribe to postgres_changes only after awaiting this: a channel that joins before the
 * session is read runs as anon, and the server rejects any filtered subscription.
 */
export const realtimeReadyClient = async (): Promise<BrowserClient> => {
  const supabase = getSupabaseBrowserClient();

  realtimeReady ??= supabase.auth.getSession().then(({ data }) => {
    void supabase.realtime.setAuth(data.session?.access_token ?? null);
  });

  await realtimeReady;

  return supabase;
};
