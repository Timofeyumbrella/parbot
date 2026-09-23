'use client';

import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/lib/db/types';
import { publicEnv } from '@/lib/env';

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** A browser client that acts as the signed-in visitor. Row level security applies. */
export const getSupabaseBrowserClient = () => {
  client ??= createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);

  return client;
};
