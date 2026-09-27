import { expect, type Locator, type Page, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { stubEmbedding } from '../src/lib/ai/stub';

import { adminClient, testEmail } from './support/accounts';
import { reload, visit } from './support/navigation';

/**
 * Projects in the chat, end to end on the stub provider: a project made in the sidebar gets a
 * pasted text as its file and an instruction, a chat started in it answers a vague question from
 * that file and cites it, a chat moved into it picks up the file as a fixed chip, and deleting the
 * project keeps its chats. A throwaway account, removed with its stored files afterwards.
 */

const PASSWORD = 'e2e-projects-pass-1';
const STORAGE_BUCKET = 'sources';
const REFUND_TEXT =
  'Refunds are issued within 30 days of purchase. Annual plans are refunded pro rata.';
const OTHER_CHAT = 'Rate limit question';

type Seeded = {
  admin: SupabaseClient;
  userId: string;
  email: string;
  assistantId: string;
  otherChatId: string;
};

/**
 * An account whose assistant knows a web page about rate limits and a pasted refund policy that
 * nothing in the questions below matches, plus one chat about rate limits outside any project.
 */
const seed = async (): Promise<Seeded | null> => {
  const admin = adminClient();

  if (!admin) {
    return null;
  }

  const email = testEmail('projects');
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
    .insert({ owner_id: userId, name: 'Acme Docs', slug: `projects-${Date.now().toString(36)}` })
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
  };

  await addSource({
    kind: 'url',
    title: 'Rate limits',
    url: 'https://docs.acme.test/limits',
    content:
      'API rate limits allow 100 requests per minute for each key. Limits reset every minute.',
  });
  await addSource({ kind: 'text', title: 'Refund policy', content: REFUND_TEXT });

  const otherChatId = crypto.randomUUID();

  await admin.from('conversations').insert({
    id: otherChatId,
    assistant_id: assistantId,
    owner_id: userId,
    channel: 'app',
    title: OTHER_CHAT,
  });
  await admin.from('messages').insert([
    {
      conversation_id: otherChatId,
      assistant_id: assistantId,
      owner_id: userId,
      role: 'user',
      content: 'How many requests per minute?',
      created_at: new Date(Date.now() - 60_000).toISOString(),
    },
    {
      conversation_id: otherChatId,
      assistant_id: assistantId,
      owner_id: userId,
      role: 'assistant',
      content: 'API rate limits allow 100 requests per minute for each key. [1]',
      answered: true,
      created_at: new Date(Date.now() - 59_000).toISOString(),
    },
  ]);

  return { admin, userId, email, assistantId, otherChatId };
};

const signIn = async (page: Page, seeded: Seeded, next: string) => {
  await visit(page, `/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(seeded.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`${next}$`), { timeout: 30_000 });
};

const sidebar = (page: Page) => page.locator('aside').getByTestId('conversation-list');
const folder = (page: Page, name: string) =>
  sidebar(page).getByTestId('project-folder').filter({ hasText: name });
const composer = (page: Page) => page.getByRole('textbox', { name: 'Message' });
const projectChips = (page: Page) => page.getByTestId('project-chip');
const answers = (page: Page) => page.locator('[data-role="assistant"]');
const chatsSection = (page: Page) =>
  sidebar(page).locator('section').filter({ has: page.getByRole('heading', { name: 'Chats' }) });

const openMenu = async (trigger: Locator) => {
  await trigger.hover();
  await trigger.click();
};

test.describe('projects in the chat', () => {
  let seeded: Seeded | null = null;

  test.beforeAll(async () => {
    seeded = await seed();
  });

  test.afterAll(async () => {
    if (!seeded) {
      return;
    }

    // Stored files are not part of the account's cascade.
    const folderPath = `${seeded.userId}/${seeded.assistantId}`;
    const { data: files } = await seeded.admin.storage.from(STORAGE_BUCKET).list(folderPath);

    if (files?.length) {
      await seeded.admin.storage
        .from(STORAGE_BUCKET)
        .remove(files.map((file) => `${folderPath}/${file.name}`));
    }

    await seeded.admin.auth.admin.deleteUser(seeded.userId);
  });

  test('a project with a pasted text and an instruction answers from it, takes chats in, and leaves them when deleted', async ({
    page,
  }) => {
    test.skip(!seeded, 'Needs the Supabase service role key from apps/web/.env');

    const { assistantId, otherChatId, admin } = seeded!;

    await signIn(page, seeded!, `/a/${assistantId}/chat`);

    // The chat from before sits under Chats, outside any project.
    await expect(chatsSection(page).getByRole('link', { name: new RegExp(OTHER_CHAT) })).toBeVisible();

    // New project: named in place, shown at once, and its home opens.
    await sidebar(page).getByRole('button', { name: 'New project' }).click();
    await sidebar(page).getByRole('textbox', { name: 'New project name' }).fill('Billing');
    await sidebar(page).getByRole('textbox', { name: 'New project name' }).press('Enter');
    await expect(folder(page, 'Billing')).toBeVisible({ timeout: 1_000 });
    await expect(page).toHaveURL(new RegExp(`/a/${assistantId}/chat/projects/[0-9a-f-]{36}$`));

    const home = page.getByTestId('project-home');

    await expect(home.getByRole('heading', { level: 1 })).toHaveText('Billing');
    await expect(home).toContainText('None yet. Add files in Edit project');

    // The pasted text and an instruction, from the project's dialog.
    await home.getByRole('button', { name: /Edit/ }).click();

    const dialog = page.getByRole('dialog');

    await dialog.getByLabel('Instructions').fill('Answer for the billing team.');
    await dialog.getByLabel('Find a file or source in Knowledge').fill('Refund');
    await dialog.getByRole('button', { name: /Refund policy/ }).click();
    await expect(dialog.getByTestId('reference-chip')).toContainText('Refund policy');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    // The home and the composer show the change straight away.
    await expect(home.getByTestId('project-instructions')).toHaveText(
      'Answer for the billing team.',
    );
    await expect(home.getByTestId('project-file')).toHaveText(/Refund policy/);
    await expect(projectChips(page)).toHaveText([/Refund policy/]);

    // It is saved: a reload shows the same project.
    await reload(page);
    await expect(page.getByTestId('project-home').getByTestId('project-file')).toHaveText(
      /Refund policy/,
    );

    // A vague question in the project is answered from its file, which the answer cites.
    await composer(page).fill('What does it say?');
    await composer(page).press('Enter');
    await expect(page.locator('[data-role="user"]')).toHaveCount(1, { timeout: 1_000 });
    await expect(page).toHaveURL(new RegExp(`/a/${assistantId}/chat/[0-9a-f-]{36}$`));

    const answer = answers(page).first();

    await expect(answer).toHaveAttribute('data-status', 'complete', { timeout: 30_000 });
    await expect(answer).toContainText('Refunds are issued within 30 days');
    await expect(answer.getByTestId('sources')).toContainText('Refund policy');

    // Inside the project the composer shows the file as fixed: it cannot be removed here.
    await expect(projectChips(page)).toHaveText([/Refund policy/]);
    await expect(page.getByRole('button', { name: 'Remove Refund policy' })).toHaveCount(0);
    await expect(page.getByTestId('project-context')).toContainText('Billing');

    const projectChatId = page.url().split('/').at(-1)!;
    const { data: stored } = await admin
      .from('conversations')
      .select('project_id')
      .eq('id', projectChatId)
      .single();

    expect(stored?.project_id).toEqual(expect.any(String));
    await expect(folder(page, 'Billing').getByRole('link', { name: /What does it say/ })).toBeVisible();

    // The chat from before has no project and no fixed chips.
    await chatsSection(page).getByRole('link', { name: new RegExp(OTHER_CHAT) }).click();
    await expect(page).toHaveURL(new RegExp(`/chat/${otherChatId}$`));
    await expect(answers(page).first()).toContainText('100 requests');
    await expect(projectChips(page)).toHaveCount(0);

    // Moved into the project from its menu, it picks up the project's file at once.
    await openMenu(sidebar(page).getByRole('button', { name: `Actions for ${OTHER_CHAT}` }));
    await page.getByRole('menuitem', { name: 'Move to project' }).click();
    await page.getByRole('menuitem', { name: 'Billing' }).click();
    await expect(projectChips(page)).toHaveText([/Refund policy/], { timeout: 1_000 });
    await expect(folder(page, 'Billing').getByRole('link', { name: new RegExp(OTHER_CHAT) })).toBeVisible();
    await expect(chatsSection(page).getByRole('link', { name: new RegExp(OTHER_CHAT) })).toHaveCount(0);

    // From the next question on, it answers with the project's file too.
    await composer(page).fill('What does it say?');
    await composer(page).press('Enter');
    await expect(answers(page).nth(1)).toHaveAttribute('data-status', 'complete', {
      timeout: 30_000,
    });
    await expect(answers(page).nth(1)).toContainText('Refunds are issued within 30 days');

    // At phone width nothing spills sideways, the fixed chips included.
    await page.setViewportSize({ width: 390, height: 780 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width: 1280, height: 800 });

    // The Inbox labels both chats with their project, in the list and on the transcript.
    await visit(page, `/a/${assistantId}/inbox`);

    const inboxRows = page.getByTestId('conversation-list').getByRole('listitem');

    await expect(inboxRows.filter({ hasText: OTHER_CHAT }).getByTestId('project-badge')).toHaveText(
      'Project: Billing',
    );
    await expect(
      inboxRows.filter({ hasText: 'What does it say?' }).getByTestId('project-badge'),
    ).toHaveText('Project: Billing');
    await inboxRows.filter({ hasText: OTHER_CHAT }).getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/inbox/${otherChatId}$`));
    await expect(page.getByTestId('project-badge')).toHaveText('Project: Billing');

    await visit(page, `/a/${assistantId}/chat/${otherChatId}`);
    await expect(projectChips(page)).toHaveText([/Refund policy/]);

    // Deleting the project says the chats stay, and they do.
    await openMenu(sidebar(page).getByRole('button', { name: 'Actions for the project Billing' }));
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    const confirm = page.getByRole('dialog');

    await expect(confirm).toContainText('Its 2 chats are kept and move to Chats.');
    await confirm.getByRole('button', { name: 'Delete project' }).click();
    await expect(folder(page, 'Billing')).toHaveCount(0);
    await expect(projectChips(page)).toHaveCount(0);
    await expect(chatsSection(page).getByRole('link', { name: new RegExp(OTHER_CHAT) })).toBeVisible();
    await expect(chatsSection(page).getByRole('link', { name: /What does it say/ })).toBeVisible();

    await reload(page);
    await expect(sidebar(page).getByTestId('project-folder')).toHaveCount(0);
    await expect(chatsSection(page).getByRole('link', { name: new RegExp(OTHER_CHAT) })).toBeVisible();
    await expect(chatsSection(page).getByRole('link', { name: /What does it say/ })).toBeVisible();
    await expect(answers(page)).toHaveCount(2);

    const { data: remaining } = await admin
      .from('conversations')
      .select('id, project_id')
      .in('id', [otherChatId, projectChatId]);

    expect(remaining).toHaveLength(2);
    expect(remaining?.every((row) => row.project_id === null)).toBe(true);
  });
});
