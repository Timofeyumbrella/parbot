import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { visit } from './support/navigation';

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const BUCKET = 'sources';

/** The service role, for seeding files the way the sources API stores them and for checking after. */
const adminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
};

type Admin = NonNullable<ReturnType<typeof adminClient>>;

const seedStoredSource = async (admin: Admin, ownerId: string, assistantId: string) => {
  const path = `${ownerId}/${assistantId}/${crypto.randomUUID()}.md`;
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, new Blob(['# Pasted notes'], { type: 'text/markdown' }), {
      contentType: 'text/markdown',
    });

  expect(uploadError).toBeNull();

  const { error } = await admin.from('sources').insert({
    assistant_id: assistantId,
    owner_id: ownerId,
    kind: 'text',
    title: 'Pasted notes',
    storage_path: path,
    mime_type: 'text/markdown',
    byte_size: 14,
    status: 'ready',
  });

  expect(error).toBeNull();

  return path;
};

/** A file in the account's folder with no row behind it, the way a crashed upload leaves one. */
const seedStrayFile = async (admin: Admin, ownerId: string) => {
  const path = `${ownerId}/${crypto.randomUUID()}/stray.md`;
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, new Blob(['# Stray'], { type: 'text/markdown' }), {
      contentType: 'text/markdown',
    });

  expect(error).toBeNull();

  return path;
};

const storedNames = async (admin: Admin, folder: string) => {
  const { data } = await admin.storage.from(BUCKET).list(folder);

  return (data ?? []).map((entry) => entry.name);
};

test.describe('starting the assistant over and deleting the account', () => {
  test('a reset removes the stored files with the rows and returns to onboarding, then the account goes with everything it owned', async ({
    page,
  }) => {
    const admin = adminClient();

    test.skip(!admin, 'needs the local Supabase keys in apps/web/.env');

    const email = `e2e-delete-${unique()}@parbot.test`;
    let ownerId = '';
    const paths: string[] = [];

    try {
      await visit(page, '/signup');
      await page.getByLabel(/full name/i).fill('Delete Tester');
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/^password/i).fill('correct-horse-battery');
      await page.getByRole('button', { name: /create account/i }).click();
      await expect(page).toHaveURL(/\/onboarding/);

      await page.getByLabel('Name', { exact: true }).fill('Acme Docs');
      await page.getByRole('button', { name: /create assistant/i }).click();
      await expect(page).toHaveURL(/\/a\/[0-9a-f-]{36}\/knowledge/);

      const assistantId = page.url().match(/\/a\/([0-9a-f-]{36})\//)?.[1] ?? '';
      const { data: profile } = await admin!
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      ownerId = profile?.id ?? '';
      expect(ownerId).not.toBe('');

      paths.push(
        await seedStoredSource(admin!, ownerId, assistantId),
        await seedStoredSource(admin!, ownerId, assistantId),
      );
      expect(await storedNames(admin!, `${ownerId}/${assistantId}`)).toHaveLength(2);

      // An account owns one assistant, and the database holds to that too.
      const { error: secondError } = await admin!
        .from('assistants')
        .insert({ owner_id: ownerId, name: 'Second', slug: `second-${unique()}` });

      expect(secondError?.code).toBe('23505');

      // The reset: Settings, Danger zone, type the name, and onboarding takes over.
      await visit(page, `/a/${assistantId}/settings`);
      await expect(
        page.getByText('then takes you to onboarding to create a new one', { exact: false }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Delete and start over' }).click();
      await page.getByLabel('Type Acme Docs to confirm').fill('Acme Docs');
      await page.getByRole('button', { name: 'Delete for good' }).click();
      await expect(page).toHaveURL(/\/onboarding$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create your assistant');
      await expect(
        page.getByRole('complementary').getByRole('link', { name: 'Set up your assistant' }),
      ).toBeVisible();
      await expect(page.getByRole('complementary').getByText('Acme Docs')).toHaveCount(0);

      expect(await storedNames(admin!, `${ownerId}/${assistantId}`)).toEqual([]);

      const { count } = await admin!
        .from('sources')
        .select('id', { count: 'exact', head: true })
        .eq('assistant_id', assistantId);

      expect(count).toBe(0);

      // The next assistant starts empty under a new id.
      await page.getByLabel('Name', { exact: true }).fill('Acme Docs Two');
      await page.getByRole('button', { name: /create assistant/i }).click();
      await expect(page).toHaveURL(/\/a\/[0-9a-f-]{36}\/knowledge/);

      const nextId = page.url().match(/\/a\/([0-9a-f-]{36})\//)?.[1] ?? '';

      expect(nextId).not.toBe(assistantId);
      await expect(page.getByRole('complementary').getByTestId('sidebar-assistant')).toContainText(
        'Acme Docs Two',
      );

      // The account: files under the assistant and a stray one beside it show the whole folder
      // goes, not one subfolder.
      paths.push(
        await seedStoredSource(admin!, ownerId, nextId),
        await seedStrayFile(admin!, ownerId),
      );

      await visit(page, '/account');
      await page.getByRole('button', { name: 'Delete account' }).click();
      await page.getByLabel(`Type ${email} to confirm`).fill(email);
      await page.getByRole('button', { name: 'Delete for good' }).click();

      await expect(page).toHaveURL(/\/login\?deleted=1/);
      await expect(
        page.getByText('Your account and everything it owned are deleted.'),
      ).toBeVisible();

      expect(await storedNames(admin!, ownerId)).toEqual([]);

      const { data: gone } = await admin!
        .from('profiles')
        .select('id')
        .eq('id', ownerId)
        .maybeSingle();

      expect(gone).toBeNull();
    } finally {
      // Whatever a failing step left behind.
      if (paths.length > 0) {
        await admin?.storage.from(BUCKET).remove(paths);
      }

      if (ownerId) {
        await admin?.auth.admin.deleteUser(ownerId);
      }
    }
  });
});
