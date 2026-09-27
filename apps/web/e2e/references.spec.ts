import { expect, type Page, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { stubEmbedding } from '../src/lib/ai/stub';

import { adminClient, testEmail } from './support/accounts';
import { reload, visit } from './support/navigation';

/**
 * Files in the chat, end to end on the stub provider: a file attached from the composer is
 * uploaded into Knowledge and answers a question worded unlike it, the answer's citation opens the
 * file's text with the passage highlighted, and a pasted text picked with @ keeps answering a
 * follow-up that does not name it. A throwaway account, removed with its stored files afterwards.
 */

const PASSWORD = 'e2e-references-pass-1';
const STORAGE_BUCKET = 'sources';

const LIMITS_FILE = [
  '# Workspace limits',
  '',
  'Each workspace holds at most five projects.',
  '',
  'Exports run once per day, at midnight UTC.',
].join('\n');

const REFUND_TEXT =
  'Refunds are issued within 30 days of purchase. Annual plans are refunded pro rata.';

type Seeded = {
  admin: SupabaseClient;
  userId: string;
  email: string;
  assistantId: string;
  refundSourceId: string;
};

/**
 * An account with an assistant that knows two things: a web page about rate limits, which the
 * word "limits" matches, and a pasted refund policy, which nothing in the questions below matches.
 */
const seed = async (): Promise<Seeded | null> => {
  const admin = adminClient();

  if (!admin) {
    return null;
  }

  const email = testEmail('refs');
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (error || !created.user) {
    throw new Error(`Could not create the e2e account: ${error?.message}`);
  }

  const userId = created.user.id;
  const { data: assistant } = await admin
    .from('assistants')
    .insert({ owner_id: userId, name: 'Acme Docs', slug: `refs-${Date.now().toString(36)}` })
    .select('id')
    .single();
  const assistantId = assistant!.id as string;

  const addSource = async (input: {
    kind: 'url' | 'text';
    title: string;
    url?: string;
    content: string;
  }) => {
    let storagePath: string | null = null;

    if (input.kind === 'text') {
      storagePath = `${userId}/${assistantId}/${crypto.randomUUID()}.md`;
      await admin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, new Blob([input.content], { type: 'text/markdown' }), {
          contentType: 'text/markdown',
        });
    }

    const { data: source } = await admin
      .from('sources')
      .insert({
        assistant_id: assistantId,
        owner_id: userId,
        kind: input.kind,
        title: input.title,
        uri: input.url ?? null,
        storage_path: storagePath,
        mime_type: storagePath ? 'text/markdown' : null,
        status: 'ready',
      })
      .select('id')
      .single();
    const { data: document } = await admin
      .from('documents')
      .insert({
        assistant_id: assistantId,
        owner_id: userId,
        source_id: source!.id,
        title: input.title,
        url: input.url ?? null,
        content: input.content,
        checksum: crypto.randomUUID(),
      })
      .select('id')
      .single();

    await admin.from('chunks').insert({
      assistant_id: assistantId,
      owner_id: userId,
      document_id: document!.id,
      position: 0,
      content: input.content,
      embedding: JSON.stringify(stubEmbedding(input.content)),
    });

    return source!.id as string;
  };

  await addSource({
    kind: 'url',
    title: 'Rate limits',
    url: 'https://docs.acme.test/limits',
    content:
      'API rate limits allow 100 requests per minute for each key. Limits reset every minute.',
  });

  const refundSourceId = await addSource({
    kind: 'text',
    title: 'Refund policy',
    content: REFUND_TEXT,
  });

  return { admin, userId, email, assistantId, refundSourceId };
};

const signIn = async (page: Page, seeded: Seeded, next: string) => {
  await visit(page, `/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(seeded.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`${next}$`), { timeout: 30_000 });
};

const composer = (page: Page) => page.getByRole('textbox', { name: 'Message' });
const chips = (page: Page) => page.getByTestId('reference-chip');
const userBubbles = (page: Page) => page.locator('[data-role="user"]');
const answers = (page: Page) => page.locator('[data-role="assistant"]');

/** No part of the page is wider than the window: nothing pushes the layout sideways. */
const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe('references in the chat', () => {
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

  test('a file attached in the composer answers a vague question and opens at the cited passage', async ({
    page,
  }) => {
    test.skip(!seeded, 'Needs the Supabase service role key from apps/web/.env');

    const { assistantId } = seeded!;

    await signIn(page, seeded!, `/a/${assistantId}/chat`);
    await expect(composer(page)).toBeVisible();

    await page.getByLabel('Choose a file to attach').setInputFiles({
      name: 'limits.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(LIMITS_FILE),
    });

    // The chip is there at once and follows the file through Knowledge.
    await expect(chips(page)).toHaveCount(1);
    await expect(chips(page)).toContainText('limits.md');
    await expect(chips(page)).toContainText(/Uploading|Indexing|Ready/);

    // Sent straight away, without waiting for the file: the question and its chip show at once.
    await composer(page).fill('what does this file say about limits?');
    await composer(page).press('Enter');
    await expect(userBubbles(page)).toHaveCount(1, { timeout: 1_000 });
    await expect(userBubbles(page).getByTestId('message-reference')).toHaveText('limits.md', {
      timeout: 1_000,
    });

    // The answer comes from the file, not from the web page the word "limits" matches.
    const answer = answers(page).first();

    await expect(answer).toHaveAttribute('data-status', 'complete', { timeout: 30_000 });
    await expect(answer).toContainText('Each workspace holds at most five projects.');
    await expect(answer).not.toContainText('100 requests');

    // The composer keeps the file for the next question, and it is indexed by now.
    await expect(chips(page)).toContainText('Ready');

    // The citation opens the file's text in the viewer with the passage lit and in view.
    await answer
      .getByTestId('sources')
      .getByRole('link', { name: /Workspace limits/ })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/a/${assistantId}/knowledge/documents/[0-9a-f-]{36}\\?passage=[0-9a-f-]{36}$`),
    );

    const viewer = page.getByTestId('document-viewer');

    await expect(viewer.getByRole('heading', { level: 1 })).toHaveText('Workspace limits');
    await expect(viewer.getByRole('status')).toHaveText(
      /The highlighted passage is the one the answer cited\./,
    );

    const passage = viewer.locator('[data-passage]');

    await expect(passage.first()).toBeInViewport();
    await expect(passage).toHaveText([
      'Each workspace holds at most five projects.',
      'Exports run once per day, at midnight UTC.',
    ]);

    // The original file opens in the browser as text.
    const open = viewer.getByRole('link', { name: 'Open file' });

    await expect(open).toHaveAttribute('href', /^\/api\/sources\/[0-9a-f-]{36}\/file$/);

    const file = await page.request.get((await open.getAttribute('href'))!);

    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toBe('text/plain; charset=utf-8');
    expect(file.headers()['content-disposition']).toMatch(/^inline; filename="limits\.md"/);
    expect(await file.text()).toContain('five projects');

    // Back goes to the chat; the chip on the question opens the same text.
    await viewer.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(new RegExp(`/a/${assistantId}/chat/[0-9a-f-]{36}$`));
    await userBubbles(page).getByTestId('message-reference').click();
    await expect(page.getByTestId('document-viewer').getByRole('heading', { level: 1 })).toHaveText(
      'Workspace limits',
    );

    // The file is in Knowledge too, like any upload.
    await visit(page, `/a/${assistantId}/knowledge`);
    await expect(page.getByTestId('source-row').filter({ hasText: 'limits.md' })).toContainText(
      'Ready',
    );

    // Attached again in a new chat, the same file is the one already in Knowledge, not a copy.
    await visit(page, `/a/${assistantId}/chat`);
    // The composer knows Knowledge's files once its @ list has loaded.
    await composer(page).fill('@limits');
    await expect(page.getByTestId('reference-picker').getByRole('option')).not.toHaveCount(0);
    await composer(page).fill('');
    await page.getByLabel('Choose a file to attach').setInputFiles({
      name: 'limits.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(LIMITS_FILE),
    });
    await expect(chips(page)).toHaveText([/limits\.md.*Already in Knowledge/]);
    await visit(page, `/a/${assistantId}/knowledge`);
    await expect(page.getByTestId('source-row').filter({ hasText: 'limits.md' })).toHaveCount(1);
  });

  test('a pasted text picked with @ keeps answering a follow-up that does not name it', async ({
    page,
  }) => {
    test.skip(!seeded, 'Needs the Supabase service role key from apps/web/.env');

    const { assistantId } = seeded!;

    await signIn(page, seeded!, `/a/${assistantId}/chat`);
    await composer(page).click();
    await page.keyboard.type('What does @Refu');

    const picker = page.getByTestId('reference-picker');

    await expect(picker).toBeVisible();
    await expect(picker.getByRole('option')).toHaveCount(1);
    await expect(picker.getByRole('option')).toContainText('Refund policy');
    await page.keyboard.press('Enter');

    await expect(picker).toBeHidden();
    await expect(chips(page)).toHaveText([/Refund policy/]);
    await expect(composer(page)).toHaveValue('What does ');

    await page.keyboard.type('it say?');
    await page.keyboard.press('Enter');

    await expect(answers(page).nth(0)).toHaveAttribute('data-status', 'complete', {
      timeout: 30_000,
    });
    await expect(answers(page).nth(0)).toContainText('Refunds are issued within 30 days');

    // The follow-up names no file; the conversation still reads the one picked above.
    await expect(chips(page)).toHaveText([/Refund policy/]);
    await composer(page).fill('And the rest?');
    await composer(page).press('Enter');
    await expect(answers(page).nth(1)).toHaveAttribute('data-status', 'complete', {
      timeout: 30_000,
    });
    await expect(answers(page).nth(1)).toContainText('Refunds are issued within 30 days');
    await expect(answers(page).nth(1).getByTestId('sources')).toContainText('Refund policy');

    // After a reload the questions keep their chips and the composer its reference.
    await reload(page);
    await expect(userBubbles(page).getByTestId('message-reference')).toHaveText([
      'Refund policy',
      'Refund policy',
    ]);
    await expect(chips(page)).toHaveText([/Refund policy/]);

    // At phone width nothing spills sideways, the chips included.
    await page.setViewportSize({ width: 360, height: 740 });
    expect(await fitsWidth(page)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 800 });

    // Removed from the composer, the file no longer answers.
    await page.getByRole('button', { name: 'Remove Refund policy' }).click();
    await expect(chips(page)).toHaveCount(0);
    await composer(page).fill('And the rest?');
    await composer(page).press('Enter');
    await expect(answers(page).nth(2)).toHaveAttribute('data-status', 'complete', {
      timeout: 30_000,
    });
    await expect(answers(page).nth(2)).toContainText("I couldn't find that in the documentation");
  });
});
