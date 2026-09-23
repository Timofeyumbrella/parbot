import 'server-only';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/db/types';
import { publicEnv, serverEnv } from '@/lib/env';

/**
 * Bypasses row level security. Only for work the visitor is not allowed to do directly:
 * ingestion, answering, widget traffic, billing webhooks. Check ownership before using it.
 */
export const createSupabaseServiceClient = () =>
  createClient<Database>(publicEnv.supabaseUrl, serverEnv().supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
