import { type Browser, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { stubEmbedding } from '../src/lib/ai/stub';

/**
 * The in-app chat, end to end against the stub provider: the reader's bubble and the streaming
 * placeholder land before the server answers, switching reads from the cache, Stop and Retry
 * work, the list stays correct across navigation, and the phone layout is usable.
 *
 * Runs as the demo account against an assistant the spec creates and removes.
 */

const DEMO_USER = '00000000-0000-4000-8000-000000000001';
const DEMO_EMAIL = 'demo@parbot.dev';
const DEMO_PASSWORD = 'parbot-demo';

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const admin = (): SupabaseClient => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to seed the chat spec.');
  }

  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

const docs = [
  {
    title: 'Authentication',
    url: 'https://docs.acme.test/auth',
    passages: [
      { heading: 'API keys', content: 'API keys are created in Settings under Developer. Rotate an API key from the same screen.' },
      { heading: 'Scopes', content: 'Each API key carries scopes. A key without the billing scope cannot read invoices.' },
    ],
  },
  {
    title: 'Webhooks',
    url: 'https://docs.acme.test/webhooks',
    passages: [
      {
        heading: 'Signatures',
        content: 'Webhooks are signed. Each webhook delivers events as JSON with a signature header you must verify before trusting the payload.',
      },
    ],
  },
];

/** An assistant with a couple of indexed chunks, embedded the way the stub provider embeds queries. */
const seedAssistant = async (service: SupabaseClient) => {
  const slug = `chat-e2e-${unique()}`;
  const { data: assistant, error } = await service
    .from('assistants')
    .insert({
      owner_id: DEMO_USER,
      name: 'Acme Docs (chat e2e)',
      slug,
      welcome_message: 'Ask me anything about the Acme docs.',
      suggested_questions: ['How do I rotate an API key?', 'How are webhooks signed?'],
    })
    .select('id')
    .single();

  if (error || !assistant) {
    throw new Error(error?.message ?? 'The assistant could not be created.');
  }

  const { data: source } = await service
    .from('sources')
    .insert({ assistant_id: assistant.id, owner_id: DEMO_USER, kind: 'text', title: 'Handbook', storage_path: slug, status: 'ready' })
    .select('id')
    .single();

  for (const doc of docs) {
    const { data: document } = await service
      .from('documents')
      .insert({
        assistant_id: assistant.id,
        owner_id: DEMO_USER,
        source_id: source!.id,
        title: doc.title,
        url: doc.url,
        content: doc.passages.map((passage) => passage.content).join('\n\n'),
        checksum: `${slug}-${doc.title}`,
      })
      .select('id')
      .single();

    await service.from('chunks').insert(
      doc.passages.map((passage, position) => ({
        assistant_id: assistant.id,
        owner_id: DEMO_USER,
        document_id: document!.id,
        position,
        heading: passage.heading,
        content: passage.content,
        embedding: JSON.stringify(stubEmbedding(passage.content)),
      })),
    );
  }

  return assistant.id as string;
};

const signIn = async (page: Page, next: string) => {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/[/[\]]/g, '\\$&')));
};

const composer = (page: Page) => page.getByRole('textbox', { name: 'Message' });
const list = (page: Page) => page.getByRole('navigation', { name: 'Conversations' });
const thread = (page: Page) => page.getByTestId('thread');
const assistantBubble = (page: Page, status: string) => page.locator(`[data-role="assistant"][data-status="${status}"]`);

const CONVERSATION_URL = /\/chat\/([0-9a-f-]{36})$/;

const openConversationId = (page: Page) => page.url().match(CONVERSATION_URL)![1]!;

/** Holds every /api/chat request for a while before letting it through, so the optimistic path is observable. */
const holdChat = (page: Page, ms: number) =>
  page.route('**/api/chat', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));

    try {
      await route.continue();
    } catch {
      // The page aborted the request while it was held (Stop), which is the point of some tests.
    }
  });

const releaseRoutes = (page: Page) => page.unrouteAll({ behavior: 'wait' });

test.describe.configure({ mode: 'serial' });

test.describe('the in-app chat', () => {
  let service: SupabaseClient;
  let assistantId: string;
  let page: Page;
  let browser: Browser;
  const conversationIds: string[] = [];
  const consoleProblems: string[] = [];

  test.beforeAll(async ({ browser: launched }) => {
    browser = launched;
    service = admin();
    assistantId = await seedAssistant(service);
    page = await browser.newPage();
    // Every flow below runs on this page; a warning or error it logs fails the last test. The
    // browser's own network log is left out: one test answers /api/chat with a 500 on purpose.
    page.on('console', (message) => {
      if ((message.type() === 'error' || message.type() === 'warning') && !message.text().startsWith('Failed to load resource')) {
        consoleProblems.push(`[${message.type()}] ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => consoleProblems.push(`[pageerror] ${error.message}`));
    // Visit both chat routes once so a dev server's first compile does not count against the timings below.
    await signIn(page, `/a/${assistantId}/chat/${crypto.randomUUID()}`);
    await page.goto(`/a/${assistantId}/chat`);
    await expect(page.getByTestId('welcome')).toBeVisible();
  });

  test.afterAll(async () => {
    await page?.close();

    if (assistantId) {
      await service.from('assistants').delete().eq('id', assistantId);
    }
  });

  test('the new chat screen shows the assistant, its welcome and its suggested questions', async () => {
    await expect(page.getByTestId('welcome')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Acme Docs (chat e2e)' })).toBeVisible();
    await expect(page.getByText('Ask me anything about the Acme docs.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'How do I rotate an API key?' })).toBeVisible();
    await expect(list(page).getByText('No conversations yet')).toBeVisible();
    await expect(composer(page)).toBeFocused();
  });

  test('a sent message shows at once with a streaming placeholder, before the server answers', async () => {
    await holdChat(page, 1200);
    await composer(page).fill('How do I rotate an API key?');

    const started = Date.now();

    await composer(page).press('Enter');

    await expect(page.locator('[data-role="user"]').getByText('How do I rotate an API key?')).toBeVisible({ timeout: 400 });
    await expect(page.getByRole('status', { name: 'Thinking' })).toBeVisible({ timeout: 400 });
    await expect(list(page).getByRole('link', { name: /How do I rotate an API key\?/ })).toBeVisible({ timeout: 400 });
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 400 });
    expect(Date.now() - started).toBeLessThan(1200);
    await expect(composer(page)).toHaveValue('');
    // The address bar follows once the router has the route's payload: one round trip, never the answer.
    await expect(page).toHaveURL(CONVERSATION_URL, { timeout: 1100 });

    conversationIds.push(openConversationId(page));
    await releaseRoutes(page);

    const answer = assistantBubble(page, 'complete');

    await expect(answer).toBeVisible({ timeout: 10_000 });
    await expect(answer).toContainText('API keys are created in Settings');
    await expect(answer.locator('sup[data-citation] a').first()).toHaveAttribute('href', 'https://docs.acme.test/auth');
    await expect(answer.getByTestId('sources')).toContainText('Authentication');
    await expect(answer.getByTestId('sources')).toContainText('docs.acme.test');
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();

    await answer.hover();
    await expect(answer.getByRole('button', { name: 'Good answer' })).toBeVisible();
    await answer.getByRole('button', { name: 'Good answer' }).click();
    await expect(answer.getByRole('button', { name: 'Good answer' })).toHaveAttribute('aria-pressed', 'true');

    await expect
      .poll(async () => {
        const { data } = await service.from('messages').select('feedback').eq('conversation_id', conversationIds[0]!).eq('role', 'assistant');

        return data?.[0]?.feedback ?? null;
      })
      .toBe(1);
  });

  test('a follow-up stays in the same conversation and an unanswered question is marked', async () => {
    // Long enough that the engine does not fold the previous question into the retrieval query.
    await composer(page).fill('What colour is the moon on a clear winter night over the ocean?');
    await composer(page).press('Enter');

    await expect(assistantBubble(page, 'complete')).toHaveCount(2, { timeout: 10_000 });

    const unanswered = assistantBubble(page, 'complete').nth(1);

    await expect(unanswered).toContainText("I couldn't find that in the documentation");
    await expect(unanswered.getByRole('link', { name: /Add docs that cover this in Knowledge/ })).toHaveAttribute(
      'href',
      `/a/${assistantId}/knowledge`,
    );
    await expect(list(page).getByLabel('1 unanswered')).toBeVisible();
  });

  test('switching between conversations reads from the cache with no skeleton', async () => {
    await page.getByRole('link', { name: 'New chat' }).first().click();
    await expect(page.getByTestId('welcome')).toBeVisible();

    await page.getByRole('button', { name: 'How are webhooks signed?' }).click();
    await expect(page).toHaveURL(CONVERSATION_URL);
    await expect(assistantBubble(page, 'complete')).toContainText('Webhooks are signed', { timeout: 10_000 });
    conversationIds.push(openConversationId(page));

    const first = list(page).getByRole('link', { name: /How do I rotate an API key\?/ });
    const started = Date.now();

    await first.click();
    await expect(thread(page)).toHaveAttribute('data-conversation', conversationIds[0]!);
    await expect(page.locator('[data-role="user"]').getByText('How do I rotate an API key?')).toBeVisible();
    expect(await page.getByTestId('thread-skeleton').count()).toBe(0);
    expect(Date.now() - started).toBeLessThan(1000);
    await expect(first).toHaveAttribute('aria-current', 'page');

    await list(page).getByRole('link', { name: /How are webhooks signed\?/ }).click();
    await expect(thread(page)).toHaveAttribute('data-conversation', conversationIds[1]!);
    await expect(page.locator('[data-role="user"]').getByText('How are webhooks signed?')).toBeVisible();
    expect(await page.getByTestId('thread-skeleton').count()).toBe(0);
  });

  test('Stop keeps what arrived and hands the composer back', async () => {
    await holdChat(page, 3000);
    await composer(page).fill('Which scopes does a key carry?');
    await composer(page).press('Enter');
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop' }).click();

    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    await expect(page.locator('[data-role="user"][data-status="stopped"]')).toContainText('Stopped before an answer was saved');
    await expect(assistantBubble(page, 'stopped')).toContainText('Stopped');
    await releaseRoutes(page);
  });

  test('a failed send shows what happened and Retry sends it again', async () => {
    await page.route('**/api/chat', (route) =>
      route.fulfill({ status: 500, contentType: 'text/html', body: '<html>Internal Server Error</html>' }),
    );

    await composer(page).fill('Can a key without the billing scope read invoices?');
    await composer(page).press('Enter');

    const failure = assistantBubble(page, 'error');

    await expect(failure).toContainText('The server could not answer (500). Try again in a moment.');
    await expect(page.locator('[data-role="user"][data-status="failed"]')).toContainText('Not sent');

    await releaseRoutes(page);
    await failure.getByRole('button', { name: 'Retry' }).click();

    await expect(assistantBubble(page, 'error')).toHaveCount(0);
    await expect(page.locator('[data-role="user"][data-status="failed"]')).toHaveCount(0);
    await expect(assistantBubble(page, 'complete').last()).toContainText(/scopes/i, { timeout: 10_000 });
  });

  test('the list picks a title change up from the database through Realtime', async () => {
    await service.from('conversations').update({ title: 'Renamed in the database' }).eq('id', conversationIds[0]!);

    await expect(list(page).getByRole('link', { name: /Renamed in the database/ })).toBeVisible({ timeout: 8000 });
  });

  test('rename is inline and optimistic; the filter and its shortcuts work', async () => {
    const row = list(page).getByRole('listitem').filter({ hasText: 'Renamed in the database' });

    await row.hover();
    await row.getByRole('button', { name: /^Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();

    const input = page.getByRole('textbox', { name: 'Conversation title' });

    await expect(input).toHaveValue('Renamed in the database');
    await input.fill('Key rotation');
    await input.press('Enter');
    await expect(list(page).getByRole('link', { name: /Key rotation/ })).toBeVisible({ timeout: 300 });

    await expect
      .poll(async () => {
        const { data } = await service.from('conversations').select('title').eq('id', conversationIds[0]!).single();

        return data?.title;
      })
      .toBe('Key rotation');

    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('searchbox', { name: 'Filter conversations' })).toBeFocused();
    await page.keyboard.type('webhooks');
    await expect(list(page).getByRole('listitem')).toHaveCount(1);
    await page.keyboard.type('zzz');
    await expect(list(page).getByText(/Nothing matches/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('searchbox', { name: 'Filter conversations' })).toHaveValue('');
    await expect(list(page).getByRole('listitem')).toHaveCount(2);
  });

  test('a conversation started here survives a visit to Knowledge and back', async () => {
    await page.getByRole('link', { name: 'New chat' }).first().click();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByTestId('welcome')).toBeVisible();
    await composer(page).fill('Where do I verify a webhook signature?');
    await composer(page).press('Enter');
    await expect(page).toHaveURL(CONVERSATION_URL);
    await expect(assistantBubble(page, 'complete')).toBeVisible({ timeout: 10_000 });
    conversationIds.push(openConversationId(page));

    await page.getByRole('link', { name: 'Knowledge' }).click();
    await expect(page).toHaveURL(/\/knowledge$/);
    await page.getByRole('link', { name: 'Chat', exact: true }).click();
    await expect(page).toHaveURL(/\/chat$/);

    const row = list(page).getByRole('link', { name: /Where do I verify a webhook signature\?/ });

    await expect(row).toBeVisible();
    // It must stay: a stale layout payload folded in later must not drop it.
    await page.waitForTimeout(1500);
    await expect(row).toBeVisible();
    await expect(list(page).getByRole('listitem')).toHaveCount(3);
  });

  test('deleting the open conversation leaves it at once, before the server confirms', async () => {
    await list(page).getByRole('link', { name: /Where do I verify a webhook signature\?/ }).click();
    await expect(page).toHaveURL(new RegExp(conversationIds[2]!));

    // Hold the server action so the navigation cannot be waiting on it.
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      try {
        await route.continue();
      } catch {
        // Navigation may have cancelled a request; nothing to do.
      }
    });

    const row = list(page).getByRole('listitem').filter({ hasText: 'Where do I verify a webhook signature?' });

    await row.hover();
    await row.getByRole('button', { name: /^Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete conversation' });

    await expect(dialog).toContainText('Where do I verify a webhook signature?');

    const started = Date.now();

    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/chat$/, { timeout: 1000 });
    await expect(page.getByTestId('welcome')).toBeVisible({ timeout: 1000 });
    expect(Date.now() - started).toBeLessThan(1200);
    await expect(list(page).getByRole('listitem')).toHaveCount(2);

    await releaseRoutes(page);
    await expect
      .poll(async () => {
        const { count } = await service.from('conversations').select('id', { count: 'exact', head: true }).eq('id', conversationIds[2]!);

        return count;
      })
      .toBe(0);
  });

  test('an unknown conversation id opens an empty thread with the composer, not a 404', async () => {
    await page.goto(`/a/${assistantId}/chat/${crypto.randomUUID()}`);

    await expect(page.getByTestId('welcome')).toBeVisible();
    await expect(composer(page)).toBeVisible();
    await expect(page.getByText('This page could not be found')).toHaveCount(0);
  });

  test('on a phone the conversations sheet opens over a header that clears the top bar', async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const mobile = await phone.newPage();

    await signIn(mobile, `/a/${assistantId}/chat/${conversationIds[0]}`);
    await expect(mobile.locator('[data-role="user"]').first()).toBeVisible();

    const overflow = await mobile.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    }));

    expect(overflow.x).toBeLessThanOrEqual(0);
    expect(overflow.y).toBeLessThanOrEqual(0);

    await mobile.getByRole('button', { name: 'Conversations' }).click();
    await expect(mobile.getByRole('dialog')).toBeVisible();
    await mobile.getByRole('dialog').getByRole('link', { name: /How are webhooks signed\?/ }).click();
    await expect(mobile).toHaveURL(new RegExp(conversationIds[1]!));
    await expect(mobile.getByRole('dialog')).toHaveCount(0);
    await expect(mobile.locator('[data-role="user"]').getByText('How are webhooks signed?')).toBeVisible();

    await phone.close();
  });

  test('a rich answer renders code, tables and chips, and Jump to latest settles at once', async () => {
    const conversationId = crypto.randomUUID();
    const answer = [
      'Rotate the key in **Settings** [1]. The old key keeps working for an hour [2].',
      '',
      '```bash',
      'acme keys rotate --id 42',
      '```',
      '',
      '| Plan | Keys |',
      '| --- | --- |',
      '| Hobby | 2 |',
      '| Starter | 10 |',
      '',
      '- Keep the old key until every service has the new one.',
      '- Revoke it afterwards.',
    ].join('\n');
    const citations = [
      { index: 1, documentId: 'd1', title: 'Authentication', url: 'https://docs.acme.test/auth', snippet: 'API keys are created in Settings.' },
      { index: 2, documentId: 'd2', title: 'Pasted notes', url: null, snippet: 'Rotate keys monthly.' },
    ];

    const { error: conversationError } = await service.from('conversations').insert({
      id: conversationId,
      assistant_id: assistantId,
      owner_id: DEMO_USER,
      channel: 'app',
      title: 'Seeded rotation thread',
    });

    expect(conversationError).toBeNull();

    for (let index = 0; index < 8; index += 1) {
      const { error: messageError } = await service.from('messages').insert([
        // A bulk insert sends null for keys one row lacks, so the user row names its empty citations.
        { conversation_id: conversationId, assistant_id: assistantId, owner_id: DEMO_USER, role: 'user', content: `Question ${index + 1}: how do I rotate a key?`, citations: [] },
        {
          conversation_id: conversationId,
          assistant_id: assistantId,
          owner_id: DEMO_USER,
          role: 'assistant',
          content: answer,
          citations,
          answered: true,
          latency_ms: 820,
        },
      ]);

      expect(messageError).toBeNull();
    }

    await page.goto(`/a/${assistantId}/chat/${conversationId}`);

    const last = assistantBubble(page, 'complete').last();

    await expect(last).toBeVisible();
    await expect(last.getByTestId('code-block')).toContainText('bash');
    await expect(last.getByTestId('code-block').locator('pre code')).toContainText('acme keys rotate --id 42');
    await expect(last.getByTestId('code-block').getByRole('button', { name: 'Copy' })).toBeVisible();
    await expect(last.getByRole('table')).toBeVisible();
    await expect(last.getByRole('columnheader', { name: 'Plan' })).toBeVisible();
    await expect(last.locator('sup[data-citation] a').nth(1)).toHaveAttribute('href', /#sources-/);
    await expect(last.getByTestId('sources')).toContainText('Pasted notes');
    await expect(last.getByText('Settings', { exact: true })).toHaveJSProperty('tagName', 'STRONG');

    const scroller = thread(page).locator('.overflow-y-auto').first();

    // Opening lands at the bottom; scrolling up shows the pill; the pill leaves as soon as it is used.
    expect(await scroller.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThan(48);
    await scroller.evaluate((node) => node.scrollTo({ top: 0 }));
    await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeVisible();
    await page.getByRole('button', { name: 'Jump to latest' }).click();
    await expect(page.getByRole('button', { name: 'Jump to latest' })).toHaveCount(0, { timeout: 150 });
    await expect
      .poll(() => scroller.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight), { timeout: 2000 })
      .toBeLessThan(48);
    await expect(page.getByRole('button', { name: 'Jump to latest' })).toHaveCount(0);

    const shots = process.env.CHAT_SHOTS_DIR;

    if (shots) {
      await page.screenshot({ path: `${shots}/desktop-dark.png`, fullPage: false });
      await page.getByRole('button', { name: 'Toggle colour scheme' }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${shots}/desktop-light.png`, fullPage: false });
      await page.getByRole('button', { name: 'Toggle colour scheme' }).click();

      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const mobile = await phone.newPage();

      await signIn(mobile, `/a/${assistantId}/chat/${conversationId}`);
      await expect(mobile.locator('[data-role="assistant"]').last()).toBeVisible();
      await mobile.screenshot({ path: `${shots}/phone-dark.png` });
      await mobile.getByRole('button', { name: 'Conversations' }).click();
      await expect(mobile.getByRole('dialog')).toBeVisible();
      await mobile.screenshot({ path: `${shots}/phone-sheet.png` });
      await phone.close();
    }
  });

  test('the frame streams before the conversation list: the list pane is a suspense boundary', async () => {
    const response = await page.request.get(`/a/${assistantId}/chat`);
    const html = await response.text();

    expect(response.status()).toBe(200);
    // React marks a pending Suspense boundary with <!--$?--> and later fills it in from a hidden segment.
    expect(html).toContain('<!--$?-->');
    expect(html).toMatch(/<template id="B:\d+">/);
  });

  test('none of the flows above logged a console error or warning', () => {
    expect(consoleProblems).toEqual([]);
  });

  test('the chat and feedback endpoints refuse bad input and strangers', async ({ request }) => {
    const signedOut = await request.post('/api/chat', {
      data: { assistantId, conversationId: crypto.randomUUID(), message: 'hi' },
    });

    expect(signedOut.status()).toBe(401);
    expect(signedOut.headers()['content-type']).toContain('text/event-stream');
    expect(await signedOut.text()).toContain('"code":"unauthorized"');

    const feedbackSignedOut = await request.post(`/api/messages/${crypto.randomUUID()}/feedback`, { data: { value: 1 } });

    expect(feedbackSignedOut.status()).toBe(401);

    const badBody = await page.request.post('/api/chat', { data: { assistantId, conversationId: 'nope', message: 'hi' } });

    expect(badBody.status()).toBe(400);
    expect(await badBody.text()).toContain('That conversation link is not valid.');

    const foreign = await page.request.post('/api/chat', {
      data: { assistantId: crypto.randomUUID(), conversationId: crypto.randomUUID(), message: 'hi' },
    });

    expect(foreign.status()).toBe(404);
    expect(await foreign.text()).toContain('"code":"not_found"');

    const badFeedback = await page.request.post(`/api/messages/${crypto.randomUUID()}/feedback`, { data: { value: 2 } });

    expect(badFeedback.status()).toBe(400);

    const missing = await page.request.post(`/api/messages/${crypto.randomUUID()}/feedback`, { data: { value: -1 } });

    expect(missing.status()).toBe(404);
  });
});
