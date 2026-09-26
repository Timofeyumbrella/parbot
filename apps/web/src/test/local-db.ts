import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/db';

/**
 * Throwaway accounts on the local Supabase stack for tests that need row level security to be
 * real. Suites that use them skip themselves where the stack's keys are not configured.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const hasLocalDb = Boolean(anonKey && serviceKey);

const options = { auth: { persistSession: false, autoRefreshToken: false } };

// Suites build their client while Vitest collects them, even when they are skipped for want of
// keys; a placeholder keeps that from throwing. Skipped suites never send a request with it.
const UNCONFIGURED = 'not-configured';

export const createServiceClient = () =>
  createClient<Database>(url, serviceKey || UNCONFIGURED, options);

export type TestAccount = {
  userId: string;
  assistantId: string;
  /** Signed in as the account through the anon key, the way a request's session client is. */
  client: SupabaseClient<Database>;
};

export const createTestAccount = async (
  service: SupabaseClient<Database>,
  label: string,
): Promise<TestAccount> => {
  const stamp = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
  const email = `${label}-${stamp}@test.parbot.dev`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !created.user) {
    throw new Error(error?.message ?? 'no user');
  }

  const { data: assistant, error: assistantError } = await service
    .from('assistants')
    .insert({ owner_id: created.user.id, name: `${label} test`, slug: `${label}-${stamp}` })
    .select('id')
    .single();

  if (assistantError || !assistant) {
    throw new Error(assistantError?.message ?? 'no assistant');
  }

  const client = createClient<Database>(url, anonKey || UNCONFIGURED, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });

  if (signInError) {
    throw new Error(signInError.message);
  }

  return { userId: created.user.id, assistantId: assistant.id, client };
};

/** Removes the account; its assistants, sources, documents and conversations go by cascade. */
export const deleteTestAccount = async (
  service: SupabaseClient<Database>,
  account: TestAccount | null,
) => {
  if (account) {
    await service.auth.admin.deleteUser(account.userId);
  }
};
