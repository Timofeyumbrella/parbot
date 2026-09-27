import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { stubEmbedding } from '../src/lib/ai/stub';

import { testEmail } from './support/accounts';
import { visit } from './support/navigation';

/**
 * Long content never widens a chat on a phone. A 300 character token with no break opportunity,
 * a long URL and a long line of code go through every surface that shows a conversation: the
 * in-app chat and the widget answer them with the stub provider, the Inbox shows the transcript,
 * and the landing's scripted demo is given the same content. On each, at 360, 390 and 414 px, the
 * page never scrolls sideways and every bubble ends inside the screen; code scrolls in its own box.
 *
 * Runs as a throwaway account the spec creates and deletes, so the demo rows are never touched.
 */

const PASSWORD = 'long-messages-e2e-password';
const PHONE_WIDTHS = [360, 390, 414];

const TOKEN = Array.from(
  { length: 300 },
  (_, index) => 'abcdefghijklmnopqrstuvwxyz0123456789'[(index * 7) % 36],
).join('');
const LONG_URL =
  'https://docs.northwind.test/reference/payments/refunds/partial-refunds-with-idempotency-keys-and-webhook-retries?version=2026-06-01&expand=balance_transaction';
const LONG_CODE =
  'curl -X POST https://api.northwind.test/v2/refunds -H "Authorization: Bearer $NORTHWIND_SECRET_KEY" -H "Idempotency-Key: 5f0c7b0e-3a8a-4d52-9d5e-2b4e0f1d7c11" -d payment=pay_3KfL0x2Qe8 -d amount=1500';

/** What the reader sends: all three at once. */
const QUESTION = `${TOKEN} ${LONG_URL} \`${LONG_CODE}\``;
/** A valid address with the longest local part allowed, which the widget's thank-you repeats. */
const LONG_EMAIL = `${TOKEN.slice(0, 64)}@example.com`;
/** The stub answers with the first sentence of the best passage, so this one carries all three. */
const PASSAGE = `Paste ${TOKEN} into ${LONG_URL} and run \`${LONG_CODE}\` to refund part of a payment.`;
/** A stored answer with a fenced block, which the stub never writes. */
const FENCED_ANSWER = `Run this from your server [1]:\n\n\`\`\`bash\n${LONG_CODE}\n\`\`\`\n\nThe reference lives at ${LONG_URL} [1]. Keep ${TOKEN} out of client code.`;

const admin = (): SupabaseClient => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to seed this spec.',
    );
  }

  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

const must = <T>({
  data,
  error,
}: {
  data: T;
  error: { message: string } | null;
}): NonNullable<T> => {
  if (error || data === null || data === undefined) {
    throw new Error(error?.message ?? 'The seed query returned nothing.');
  }

  return data;
};

type Seed = {
  userId: string;
  email: string;
  assistantId: string;
  publicKey: string;
  chatConversationId: string;
  widgetConversationId: string;
};

const seed = async (service: SupabaseClient): Promise<Seed> => {
  const email = testEmail('long-messages');
  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (error || !created.user) {
    throw new Error(error?.message ?? 'The throwaway account could not be created.');
  }

  const userId = created.user.id;
  const slug = email.split('@')[0]!.replace(/[^a-z0-9-]/g, '-');
  // Starter, so the widget offers to take an email when the docs fall short.
  must(
    await service
      .from('subscriptions')
      .update({ plan_id: 'starter', status: 'active', billing_interval: 'monthly' })
      .eq('account_id', userId)
      .select('account_id'),
  );

  const assistant = must(
    await service
      .from('assistants')
      .insert({
        owner_id: userId,
        name: 'Northwind docs',
        slug,
        mode: 'bubble',
        lead_capture: true,
      })
      .select('id, public_key')
      .single(),
  );
  const source = must(
    await service
      .from('sources')
      .insert({
        assistant_id: assistant.id,
        owner_id: userId,
        kind: 'text',
        title: 'Refunds guide',
        storage_path: `${userId}/${assistant.id}/refunds.md`,
        status: 'ready',
      })
      .select('id')
      .single(),
  );
  const document = must(
    await service
      .from('documents')
      .insert({
        assistant_id: assistant.id,
        owner_id: userId,
        source_id: source.id,
        url: LONG_URL,
        title: 'Partial refunds with idempotency keys and webhook retries',
        content: PASSAGE,
        checksum: `long-messages-${slug}`,
      })
      .select('id')
      .single(),
  );

  must(
    await service
      .from('chunks')
      .insert({
        assistant_id: assistant.id,
        owner_id: userId,
        document_id: document.id,
        position: 0,
        heading: 'Partial refunds',
        content: PASSAGE,
        embedding: JSON.stringify(stubEmbedding(PASSAGE)),
      })
      .select('id'),
  );

  const now = Date.now();
  /** One exchange with a fenced answer, titled as the engine titles it: the question's first 60 characters. */
  const conversation = async (fields: Record<string, unknown>) => {
    const row = must(
      await service
        .from('conversations')
        .insert({
          assistant_id: assistant.id,
          owner_id: userId,
          title: `${TOKEN.slice(0, 60)}…`,
          ...fields,
        })
        .select('id')
        .single(),
    );
    const message = (created: number, rest: Record<string, unknown>) => ({
      conversation_id: row.id,
      assistant_id: assistant.id,
      owner_id: userId,
      created_at: new Date(now - created).toISOString(),
      ...rest,
    });

    must(
      await service
        .from('messages')
        .insert([
          message(60_000, { role: 'user', content: QUESTION, citations: [] }),
          message(58_000, {
            role: 'assistant',
            content: FENCED_ANSWER,
            answered: true,
            citations: [
              {
                index: 1,
                documentId: document.id,
                title: 'Partial refunds with idempotency keys and webhook retries',
                url: LONG_URL,
                snippet: PASSAGE.slice(0, 200),
              },
            ],
          }),
        ])
        .select('id'),
    );

    return row.id as string;
  };

  return {
    userId,
    email,
    assistantId: assistant.id as string,
    publicKey: assistant.public_key as string,
    chatConversationId: await conversation({ channel: 'app' }),
    // A reader's conversation from a page with a long address, which the Inbox panel shows.
    widgetConversationId: await conversation({
      channel: 'widget',
      visitor_id: 'visitor_0123456789abcdef01234567',
      page_url: LONG_URL,
    }),
  };
};

const signIn = async (page: Page, email: string, next: string) => {
  await visit(page, `/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/[\]?]/g, '\\$&')}$`));
};

/**
 * The page does not scroll sideways and each box ends inside the screen. The second check matters
 * where an ancestor clips: the landing hero hides its overflow, so a stretched chat there never
 * widened the page, it just ran off the right edge.
 */
const expectInsideScreen = async (page: Page, boxes: Locator, label: string) => {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.scrollingElement!.scrollWidth,
    innerWidth: window.innerWidth,
  }));

  expect(scrollWidth, `${label}: page width at ${innerWidth}px`).toBeLessThanOrEqual(innerWidth);

  const count = await boxes.count();

  expect(count, `${label}: boxes to measure`).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const box = await boxes.nth(index).boundingBox();

    expect(box, `${label}: box ${index} is rendered`).not.toBeNull();
    expect(box!.x, `${label}: box ${index} left edge`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${label}: box ${index} right edge`).toBeLessThanOrEqual(
      innerWidth,
    );
  }
};

/**
 * A scrolling pane has nothing to scroll sideways. A word that overflows its box inside a pane
 * that scrolls, like the widget's message list, never widens the page; it makes the pane scroll.
 */
const expectNoSidewaysScroll = async (pane: Locator, label: string) => {
  const { scrollWidth, clientWidth } = await pane.evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
  }));

  expect(scrollWidth, `${label}: sideways scroll in the pane`).toBeLessThanOrEqual(clientWidth);
};

/** Measures at every phone width. The layout reflows on resize, so one visit covers all three. */
const atEveryPhoneWidth = async (page: Page, check: (width: number) => Promise<void>) => {
  for (const width of PHONE_WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await check(width);
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('long messages on a phone', () => {
  let service: SupabaseClient;
  let seeded: Seed;
  let browser: Browser;
  let page: Page;

  test.beforeAll(async ({ browser: launched }) => {
    browser = launched;
    service = admin();
    seeded = await seed(service);
    page = await browser.newPage({ viewport: { width: PHONE_WIDTHS[0]!, height: 800 } });
    // Sign-in lands on the account's one assistant.
    await signIn(page, seeded.email, `/a/${seeded.assistantId}`);
  });

  test.afterAll(async () => {
    await page?.close();

    if (seeded?.userId) {
      // Everything the account owns goes with it.
      await service.auth.admin.deleteUser(seeded.userId);
    }
  });

  test('the in-app chat wraps a stored answer and a streamed one inside the screen', async () => {
    await page.setViewportSize({ width: PHONE_WIDTHS[0]!, height: 800 });
    await visit(page, `/a/${seeded.assistantId}/chat/${seeded.chatConversationId}`);

    const thread = page.getByTestId('thread');
    // The pane that scrolls the messages.
    const messages = thread.locator(':scope > div').first();
    const stored = thread.locator('[data-role="assistant"][data-status="complete"]');

    await expect(stored.getByTestId('code-block')).toBeVisible();

    const code = stored.locator('pre');

    await atEveryPhoneWidth(page, async (width) => {
      await expectInsideScreen(
        page,
        thread.locator('[data-role] > div, [data-testid="code-block"], [data-testid="sources"]'),
        `stored chat at ${width}`,
      );
      await expectNoSidewaysScroll(messages, `stored chat at ${width}`);
      // The long line scrolls inside its block instead of pushing it wider.
      expect(await code.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    });

    await page.setViewportSize({ width: PHONE_WIDTHS[0]!, height: 800 });
    await visit(page, `/a/${seeded.assistantId}/chat`);

    const composer = page.getByRole('textbox', { name: 'Message' });

    await expect(async () => {
      await composer.fill(QUESTION);
      await expect(composer).toHaveValue(QUESTION, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await composer.press('Enter');

    const answer = thread.locator('[data-role="assistant"][data-status="complete"]');

    await expect(answer).toBeVisible({ timeout: 15_000 });
    await expect(answer).toContainText('to refund part of a payment.');
    await expect(answer.locator('a[href^="https://docs.northwind.test/"]').first()).toBeVisible();

    await atEveryPhoneWidth(page, async (width) => {
      await expectInsideScreen(
        page,
        thread.locator('[data-role] > div, [data-testid="sources"]'),
        `streamed chat at ${width}`,
      );
      await expectNoSidewaysScroll(messages, `streamed chat at ${width}`);
    });
  });

  test('the Inbox list and transcript stay inside the screen', async () => {
    await page.setViewportSize({ width: PHONE_WIDTHS[0]!, height: 800 });
    await visit(page, `/a/${seeded.assistantId}/inbox`);
    await expect(page.getByTestId('conversation-list')).toBeVisible();

    await atEveryPhoneWidth(page, async (width) => {
      await expectInsideScreen(
        page,
        page.getByTestId('conversation-list').locator('li'),
        `inbox list at ${width}`,
      );
    });

    await page.setViewportSize({ width: PHONE_WIDTHS[0]!, height: 800 });
    await visit(page, `/a/${seeded.assistantId}/inbox/${seeded.widgetConversationId}`);

    const transcript = page.getByTestId('transcript-message');

    await expect(transcript).toHaveCount(2);
    await expect(transcript.locator('pre')).toBeVisible();

    await atEveryPhoneWidth(page, async (width) => {
      await expectInsideScreen(
        page,
        page.locator(
          '[data-testid="transcript-message"] > div, [data-testid="transcript-message"] [data-testid="code-block"], h1, [data-testid="conversation-panel"]',
        ),
        `inbox transcript at ${width}`,
      );
    });
  });

  test('the widget wraps a streamed answer and a fenced one inside the screen', async ({
    browser: launched,
  }) => {
    // A visitor, not the signed-in owner.
    const visitor = await launched.newPage({ viewport: { width: PHONE_WIDTHS[0]!, height: 800 } });
    const widget = (selector: string) => visitor.locator(`#parbot-widget ${selector}`);

    try {
      await visit(visitor, `/demo/${seeded.publicKey}`);
      await widget('.pb-launcher').click();
      await expect(widget('.pb-panel')).toHaveClass(/pb-open/);

      const input = widget('textarea');

      await input.fill(QUESTION);
      await input.press('Enter');
      await expect(widget('.pb-item-assistant .pb-body')).toContainText(
        'to refund part of a payment.',
        { timeout: 15_000 },
      );
      await expect(widget('.pb-sources')).toBeVisible();

      // The stub never writes a fenced block, so the next answer is a fixed stream.
      const events = [
        { type: 'token', text: FENCED_ANSWER },
        {
          type: 'citations',
          citations: [
            {
              index: 1,
              documentId: 'refunds',
              title: 'Partial refunds with idempotency keys and webhook retries',
              url: LONG_URL,
              snippet: '',
            },
          ],
        },
        { type: 'done', answered: true, latencyMs: 5 },
      ];

      await visitor.route('**/api/widget/chat', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
        }),
      );
      await input.fill(`${TOKEN} again`);
      await input.press('Enter');
      await expect(widget('.pb-body pre')).toBeVisible({ timeout: 15_000 });
      await visitor.unrouteAll({ behavior: 'wait' });

      // Something the docs do not cover: the email offer, and a thank-you that repeats a long address.
      await input.fill('What will the weather be like on Mars next week?');
      await input.press('Enter');

      const form = widget('form.pb-lead');

      await expect(form).toBeVisible({ timeout: 15_000 });
      await form.locator('input[name=email]').fill(LONG_EMAIL);
      await form.locator('button[type=submit]').click();
      await expect(widget('.pb-thanks')).toHaveText(
        `Thanks. The team will reply to ${LONG_EMAIL}.`,
      );

      await atEveryPhoneWidth(visitor, async (width) => {
        await expectInsideScreen(
          visitor,
          widget('.pb-msg, .pb-body pre, .pb-sources, .pb-thanks'),
          `widget at ${width}`,
        );
        await expectNoSidewaysScroll(widget('.pb-messages'), `widget at ${width}`);
        expect(
          await widget('.pb-body pre').evaluate((node) => node.scrollWidth > node.clientWidth),
        ).toBe(true);
      });
    } finally {
      await visitor.close();
    }
  });

  test('the landing demo keeps its frame inside the screen with the same content', async ({
    browser: launched,
  }) => {
    // Reduced motion holds the first exchange still, so the content can be swapped for the long one.
    const visitor = await launched.newPage({
      viewport: { width: PHONE_WIDTHS[0]!, height: 800 },
      reducedMotion: 'reduce',
    });

    try {
      await visit(visitor, '/');

      const demo = visitor.getByRole('figure', { name: /example conversation/i });
      const frame = demo.getByTestId('demo-frame');

      await expect(frame.getByTestId('demo-user-message').first()).toBeVisible();
      await expect(frame.getByTestId('demo-code-block').first()).toBeVisible();

      await frame.evaluate(
        (node, { token, url, code }) => {
          const user = node.querySelector('[data-testid="demo-user-message"]');
          const prose = node.querySelector('[data-testid="demo-answer"]');
          const pre = node.querySelector('[data-testid="demo-code-block"] code');

          if (!user || !prose || !pre) {
            throw new Error('The demo frame is missing a message.');
          }

          user.textContent = `${token} ${url} \`${code}\``;

          const paragraph = document.createElement('p');
          const link = document.createElement('a');
          const inline = document.createElement('code');

          link.href = url;
          link.textContent = url;
          inline.textContent = code;
          paragraph.append(token, ' ', link, ' ', inline);
          prose.prepend(paragraph);
          pre.textContent = code;
        },
        { token: TOKEN, url: LONG_URL, code: LONG_CODE },
      );

      await atEveryPhoneWidth(visitor, async (width) => {
        await expectInsideScreen(
          visitor,
          frame.locator(
            '[data-testid="demo-user-message"], [data-testid="demo-answer"], [data-testid="demo-code-block"]',
          ),
          `landing demo at ${width}`,
        );
        await expectInsideScreen(visitor, frame, `landing frame at ${width}`);
        await expectNoSidewaysScroll(frame.getByTestId('demo-thread'), `landing demo at ${width}`);
      });
    } finally {
      await visitor.close();
    }
  });
});
