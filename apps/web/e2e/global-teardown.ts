import { adminClient, runTag, STALE_AFTER_MS, TEST_EMAIL_DOMAIN } from './support/accounts';

/**
 * Specs clean up after each test, but an interrupted run or a failure before cleanup leaves
 * accounts behind in the shared local database. This removes every `@parbot.test` account this
 * run created, and any older than an hour from runs that never finished. Accounts of a run that
 * is still going elsewhere are left alone.
 */
export default async function globalTeardown() {
  const admin = adminClient();

  if (!admin) {
    return;
  }

  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, email, created_at')
    .like('email', `%@${TEST_EMAIL_DOMAIN}`);

  if (error) {
    console.warn(`[e2e teardown] could not list test accounts: ${error.message}`);

    return;
  }

  const leftovers = (profiles ?? []).filter(
    (profile) =>
      profile.email.endsWith(`.${runTag()}@${TEST_EMAIL_DOMAIN}`) ||
      Date.parse(profile.created_at) < Date.parse(staleBefore),
  );

  for (const profile of leftovers) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(profile.id);

    if (deleteError) {
      console.warn(`[e2e teardown] could not delete ${profile.email}: ${deleteError.message}`);
    }
  }
}
