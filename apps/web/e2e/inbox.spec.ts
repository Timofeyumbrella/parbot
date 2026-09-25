import { type Browser, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The Inbox against real rows: the list pages in the server's order and keeps it after
 * "Load more", and a transcript shows its sources exactly as the chat shows them.
 *
 * Runs as a throwaway account the spec creates and deletes, so the demo rows are never touched.
 */

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const PASSWORD = 'inbox-e2e-password';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const admin = (): SupabaseClient => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to seed the inbox spec.');
  }

  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

const must = <T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (error || data === null || data === undefined) {
    throw new Error(error?.message ?? 'The seed query returned nothing.');
  }

  return data;
};

const QUESTIONS = ['How do I rotate an API key?', 'How are webhooks signed?', 'Which plan includes the palette mode?'];
const OLD_QUESTION = 'Do you support JavaScript-rendered docs sites?';

const AUTH_DOC = crypto.randomUUID();
const NOTES_DOC = crypto.randomUUID();

/** Passages 2 and 5 come from the same page; 1 and 4 were retrieved but not cited. */
const CITED_ANSWER = {
  content: 'Create the key under Settings [2]. Rotate it every month [3]. A key only reaches what its scopes allow [5].',
  citations: [
    { index: 2, documentId: AUTH_DOC, title: 'Authentication', url: 'https://docs.acme.test/auth', snippet: 'API keys are created in Settings.' },
    { index: 3, documentId: NOTES_DOC, title: 'Pasted notes', url: null, snippet: 'Rotate keys monthly.' },
    { index: 5, documentId: AUTH_DOC, title: 'Authentication', url: 'https://docs.acme.test/auth', snippet: 'Each key carries scopes.' },
  ],
};

type Seed = { userId: string; email: string; assistantId: string; citedConversationId: string; citedMessageId: string };

const seed = async (service: SupabaseClient): Promise<Seed> => {
  const email = `inbox-e2e-${unique()}@parbot.test`;
  const { data: created, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });

  if (error || !created.user) {
    throw new Error(error?.message ?? 'The throwaway account could not be created.');
  }

  const userId = created.user.id;
  const assistant = must(
    await service
      .from('assistants')
      .insert({ owner_id: userId, name: 'Acme Docs (inbox e2e)', slug: `inbox-e2e-${unique()}` })
      .select('id')
      .single(),
  );
  const assistantId = assistant.id as string;
  const now = Date.now();

  // 33 conversations with a question each, more than one page of 30. Their last message sets the order.
  const asked = must(
    await service
      .from('conversations')
      .insert(Array.from({ length: 33 }, (_, index) => ({ assistant_id: assistantId, owner_id: userId, title: `Asked ${index}` })))
      .select('id'),
  );

  // One question well over a week old, so its row in Top questions shows a date instead of "3 days ago".
  const questionAt = (index: number) =>
    new Date(index === asked.length - 1 ? now - 10 * DAY : now - (index + 5) * MINUTE).toISOString();

  must(
    await service
      .from('messages')
      .insert(
        asked.map((row, index) => ({
          conversation_id: row.id,
          assistant_id: assistantId,
          owner_id: userId,
          role: 'user',
          content: index === asked.length - 1 ? OLD_QUESTION : QUESTIONS[index % QUESTIONS.length]!,
          created_at: questionAt(index),
        })),
      )
      .select('id'),
  );

  // Started after every question above but never asked anything: the server pages these last.
  must(
    await service
      .from('conversations')
      .insert(Array.from({ length: 3 }, (_, index) => ({ assistant_id: assistantId, owner_id: userId, title: `Started only ${index}` })))
      .select('id'),
  );

  const cited = must(
    await service
      .from('conversations')
      .insert({ assistant_id: assistantId, owner_id: userId, title: 'Rotating keys', created_at: new Date(now - 3 * DAY).toISOString() })
      .select('id')
      .single(),
  );
  const message = (fields: Record<string, unknown>) => ({
    conversation_id: cited.id,
    assistant_id: assistantId,
    owner_id: userId,
    ...fields,
  });

  must(
    await service
      .from('messages')
      .insert(message({ role: 'user', content: 'How do I rotate a key?', created_at: new Date(now - 3 * DAY).toISOString() }))
      .select('id')
      .single(),
  );

  const answer = must(
    await service
      .from('messages')
      .insert(
        message({
          role: 'assistant',
          content: CITED_ANSWER.content,
          citations: CITED_ANSWER.citations,
          answered: true,
          created_at: new Date(now - 3 * DAY + 2000).toISOString(),
        }),
      )
      .select('id')
      .single(),
  );

  return { userId, email, assistantId, citedConversationId: cited.id as string, citedMessageId: answer.id as string };
};

const signIn = async (page: Page, email: string, next: string) => {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/[\]?]/g, '\\$&')}$`));
};

test.describe.configure({ mode: 'serial' });

test.describe('the inbox and the overview', () => {
  let service: SupabaseClient;
  let seeded: Seed;
  let browser: Browser;
  let page: Page;

  test.beforeAll(async ({ browser: launched }) => {
    browser = launched;
    service = admin();
    seeded = await seed(service);
    page = await browser.newPage();
    await signIn(page, seeded.email, '/dashboard');
  });

  test.afterAll(async () => {
    await page?.close();

    if (seeded?.userId) {
      // Everything the account owns goes with it.
      await service.auth.admin.deleteUser(seeded.userId);
    }
  });

  test('the list shows conversations in the order the server pages them, before and after Load more', async () => {
    const expected = must(
      await service
        .from('conversations')
        .select('id')
        .eq('assistant_id', seeded.assistantId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false }),
    ).map((row) => row.id as string);

    await page.goto(`/a/${seeded.assistantId}/inbox`);

    const rows = page.getByTestId('conversation-list').locator('li[data-conversation-id]');
    const shown = () => rows.evaluateAll((items) => items.map((item) => item.getAttribute('data-conversation-id')));

    await expect(rows).toHaveCount(30);
    expect(await shown()).toEqual(expected.slice(0, 30));

    await page.getByRole('button', { name: 'Load more' }).click();
    await expect(rows).toHaveCount(expected.length);
    expect(await shown()).toEqual(expected);
    await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
  });

  test('a transcript shows its sources with the chat components, one chip per page', async () => {
    await page.goto(`/a/${seeded.assistantId}/inbox/${seeded.citedConversationId}`);

    const answer = page.locator('[data-testid="transcript-message"][data-role="assistant"]');

    // Every marker becomes a chip, including 5 although only three passages were cited.
    await expect(answer.locator('sup[data-citation]')).toHaveText(['2', '3', '5']);
    await expect(answer.locator('sup[data-citation="5"] a')).toHaveAttribute('href', 'https://docs.acme.test/auth');
    await expect(answer.locator('sup[data-citation="3"] a')).toHaveAttribute('href', `#sources-${seeded.citedMessageId}`);

    const sources = answer.getByTestId('sources');

    await expect(sources.getByRole('link')).toHaveCount(1);
    await expect(sources.getByRole('link')).toHaveAttribute('href', 'https://docs.acme.test/auth');
    await expect(sources.getByRole('link')).toContainText('Authentication');
    await expect(sources.getByText('Pasted notes')).toBeVisible();
    await expect(sources.getByText('Authentication')).toHaveCount(1);

    const transcriptHtml = await sources.evaluate((node) => node.outerHTML);

    // The same answer in the chat renders the very same markup.
    await page.goto(`/a/${seeded.assistantId}/chat/${seeded.citedConversationId}`);

    const chatAnswer = page.locator('[data-role="assistant"]');
    const chatSources = chatAnswer.getByTestId('sources');

    await expect(chatSources).toBeVisible();
    await expect(chatAnswer.locator('sup[data-citation]')).toHaveText(['2', '3', '5']);
    expect(await chatSources.evaluate((node) => node.outerHTML)).toBe(transcriptHtml);
  });
});
