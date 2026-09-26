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

const storedNames = async (admin: Admin, folder: string) => {
  const { data } = await admin.storage.from(BUCKET).list(folder);

  return (data ?? []).map((entry) => entry.name);
};

test.describe('deleting an assistant and the account', () => {
  test('removes the stored files with the rows, then the account with everything it owned', async ({
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

      // The assistant: Settings, Danger zone, type the name.
      await visit(page, `/a/${assistantId}/settings`);
      await page.getByRole('button', { name: 'Delete assistant' }).click();
      await page.getByLabel('Type Acme Docs to confirm').fill('Acme Docs');
      await page.getByRole('button', { name: 'Delete for good' }).click();
      await expect(page).toHaveURL(/\/(dashboard|onboarding)/);

      expect(await storedNames(admin!, `${ownerId}/${assistantId}`)).toEqual([]);

      const { count } = await admin!
        .from('sources')
        .select('id', { count: 'exact', head: true })
        .eq('assistant_id', assistantId);

      expect(count).toBe(0);

      // The account: a second assistant with a file shows the whole folder goes, not one subfolder.
      const { data: second } = await admin!
        .from('assistants')
        .insert({ owner_id: ownerId, name: 'Second', slug: `second-${unique()}` })
        .select('id')
        .single();

      paths.push(await seedStoredSource(admin!, ownerId, second!.id));

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
