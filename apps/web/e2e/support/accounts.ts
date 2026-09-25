import { createClient } from '@supabase/supabase-js';

/** Every account an e2e spec signs up with lives under this domain, and nothing else does. */
export const TEST_EMAIL_DOMAIN = 'parbot.test';

/** Leftovers older than this come from a run that was interrupted, not from one still going. */
export const STALE_AFTER_MS = 60 * 60 * 1000;

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Set by the global setup, so the teardown can tell this run's accounts from a parallel run's. */
export const runTag = () => process.env.E2E_RUN_TAG ?? 'local';

export const testEmail = (prefix: string) =>
  `${prefix}-${unique()}.${runTag()}@${TEST_EMAIL_DOMAIN}`;

/** The service-role client from apps/web/.env, or null when there is none (cleanup is skipped). */
export const adminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
};

/** Removes an account a spec created, and with it everything it owns. */
export const removeAccount = async (email: string) => {
  const admin = adminClient();

  if (!admin) {
    return;
  }

  const { data } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();

  if (data?.id) {
    await admin.auth.admin.deleteUser(data.id);
  }
};

/**
 * Accounts a spec signs up with during one test, removed after it whether it passed or not:
 * `const accounts = trackAccounts(); test.afterEach(accounts.cleanup);`.
 */
export const trackAccounts = () => {
  const emails: string[] = [];

  return {
    email: (prefix: string) => {
      const email = testEmail(prefix);
      emails.push(email);

      return email;
    },
    cleanup: async () => {
      await Promise.all(emails.splice(0).map(removeAccount));
    },
  };
};
