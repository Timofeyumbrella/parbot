import path from 'node:path';

import { expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The Knowledge screen against the stub provider: the Add source dialog says what is wrong inline,
 * and pasted text and an uploaded Word file are stored, indexed after the response and shown as
 * ready. The spec creates its own Hobby account and deletes it, with its stored files, afterwards.
 */

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = 'e2e-knowledge-pass-1';
const STORAGE_BUCKET = 'sources';
const DOCX = path.resolve(__dirname, '../src/lib/ingest/fixtures/handbook.docx');

type Seeded = { admin: SupabaseClient; userId: string; email: string; assistantId: string };

const seed = async (): Promise<Seeded | null> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const tag = unique();
  const email = `e2e-knowledge-${tag}@parbot.test`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (error || !created.user) {
    throw new Error(`Could not create the e2e account: ${error?.message}`);
  }

  const { data: assistant } = await admin
    .from('assistants')
    .insert({ owner_id: created.user.id, name: 'Knowledge e2e', slug: `e2e-knowledge-${tag}` })
    .select('id')
    .single();

  if (!assistant) {
    throw new Error('Could not create the e2e assistant.');
  }

  return { admin, userId: created.user.id, email, assistantId: assistant.id };
};

const signIn = async (page: Page, seeded: Seeded, next: string) => {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(seeded.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // The dev server compiles the dashboard on its first visit.
  await expect(page).toHaveURL(new RegExp(`${next}$`), { timeout: 30_000 });
};

const sourceRow = (page: Page, title: string) =>
  page.getByTestId('source-row').filter({ hasText: title });

/** The header copy of the meter; a second one takes its place on phones. */
const pagesMeter = (page: Page) => page.getByTestId('pages-meter').first();

test.describe('knowledge screen', () => {
  let seeded: Seeded | null = null;

  test.beforeAll(async () => {
    seeded = await seed();
  });

  test.afterAll(async () => {
    if (!seeded) {
      return;
    }

    // Stored files are not part of the account's cascade.
    const folder = `${seeded.userId}/${seeded.assistantId}`;
    const { data: files } = await seeded.admin.storage.from(STORAGE_BUCKET).list(folder);

    if (files?.length) {
      await seeded.admin.storage
        .from(STORAGE_BUCKET)
        .remove(files.map((file) => `${folder}/${file.name}`));
    }

    await seeded.admin.auth.admin.deleteUser(seeded.userId);
  });

  test('checks the form inline, then indexes pasted text and a Word file', async ({ page }) => {
    test.skip(!seeded, 'Needs the Supabase service role key from apps/web/.env');

    await signIn(page, seeded!, `/a/${seeded!.assistantId}/knowledge`);
    await expect(page.getByRole('heading', { name: 'Knowledge' })).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Answers are placeholders' }),
    ).not.toContainText('GEMINI');

    await page.getByRole('button', { name: 'Add source' }).click();

    const dialog = page.getByRole('dialog', { name: 'Add source' });
    const address = dialog.getByLabel('Start page');

    // An empty submit reaches the form, which says what is missing under the field.
    await dialog.getByRole('button', { name: 'Add website' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter a web address.');
    await expect(address).toHaveAttribute('aria-invalid', 'true');

    await address.fill('docs.example.com');
    await dialog.getByRole('button', { name: 'Add website' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      'Enter a full address that starts with http:// or https://.',
    );

    await dialog.getByRole('tab', { name: /text/i }).click();
    await dialog.getByLabel('Title', { exact: true }).fill('Refund policy');
    await dialog
      .getByLabel('Text', { exact: true })
      .fill('# Refunds\n\nRefunds are issued within 30 days of purchase.');
    await dialog.getByRole('button', { name: 'Add text' }).click();
    await expect(dialog).toBeHidden();
    await expect(sourceRow(page, 'Refund policy').getByText('Ready')).toBeVisible({
      timeout: 30_000,
    });
    await expect(sourceRow(page, 'Refund policy')).toContainText('1 page');
    await expect(pagesMeter(page)).toContainText(/^1 of [\d,]+ pages/);

    await page.getByRole('button', { name: 'Add source' }).click();
    await dialog.getByRole('tab', { name: /Upload/ }).click();
    await dialog.getByLabel('Choose file').setInputFiles(DOCX);
    await expect(dialog.getByText('handbook.docx')).toBeVisible();
    await dialog.getByRole('button', { name: 'Upload file' }).click();
    await expect(dialog).toBeHidden();
    await expect(sourceRow(page, 'handbook.docx').getByText('Ready')).toBeVisible({
      timeout: 30_000,
    });
    await expect(sourceRow(page, 'handbook.docx')).toContainText('1 page');
    // The meter follows the rows without a reload: it once stayed at 1 until the next visit.
    await expect(pagesMeter(page)).toContainText(/^2 of [\d,]+ pages/, { timeout: 2_000 });

    const { data: documents } = await seeded!.admin
      .from('documents')
      .select('title')
      .eq('owner_id', seeded!.userId)
      .order('title');

    expect(documents).toEqual([{ title: 'Handbook' }, { title: 'Refund policy' }]);

    await page.getByRole('button', { name: 'Actions for Refund policy' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page
      .getByRole('dialog', { name: 'Delete Refund policy?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(sourceRow(page, 'Refund policy')).toHaveCount(0);
    await expect(pagesMeter(page)).toContainText(/^1 of [\d,]+ pages/, { timeout: 2_000 });
  });
});
