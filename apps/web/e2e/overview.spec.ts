import { expect, type Locator, type Page, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { projectUsage } from '../src/lib/overview';
import { PLANS, usagePeriodStart } from '../src/lib/plans';

import { adminClient, removeAccount, testEmail } from './support/accounts';
import { visit } from './support/navigation';

/**
 * The Overview against rows whose every number is known: answered, unanswered (three wordings of
 * one question among them), rated up and down, stopped, citing several pages (one through an id
 * that re-indexing replaced), asked from several widget pages, a lead, and a previous week to
 * compare with. Each section's numbers on screen are checked against what was seeded.
 *
 * Runs as a throwaway account the spec creates and deletes, so the demo rows are never touched.
 */

const PASSWORD = 'overview-e2e-password';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const HOST = 'docs.acme.test';
const USED_THIS_MONTH = 150;

type Seeded = {
  userId: string;
  assistantId: string;
  emptyAssistantId: string;
  dislikedConversationId: string;
  dislikedMessageId: string;
};

const must = <T>({ data, error }: { data: T; error: { message: string } | null }) => {
  if (error || data === null || data === undefined) {
    throw new Error(error?.message ?? 'The seed query returned nothing.');
  }

  return data as NonNullable<T>;
};

type Exchange = {
  question: string;
  /** true answered, false unanswered, null stopped by the reader. */
  answered: boolean | null;
  answer?: string;
  /** Documents the answer cites, by key; `stale` is an id that re-indexing replaced. */
  cites?: ('auth' | 'webhooks' | 'faq' | 'legacy' | 'stale')[];
  feedback?: 1 | -1;
  latencyMs: number;
  minutesAgo: number;
  page?: string;
};

/** This week, oldest first. The minutes decide the order of every list below. */
const THIS_WEEK: Exchange[] = [
  {
    question: 'How do I rotate an API key?',
    answered: true,
    cites: ['auth', 'auth'],
    feedback: 1,
    latencyMs: 1000,
    minutesAgo: 170,
    page: `https://${HOST}/auth?ref=nav`,
  },
  {
    question: 'Where do I create API keys?',
    answered: true,
    cites: ['auth'],
    feedback: 1,
    latencyMs: 1200,
    minutesAgo: 160,
    page: `https://${HOST}/auth/`,
  },
  {
    question: 'How are webhooks signed?',
    answered: true,
    answer: 'Each webhook carries a **signature** header [1].\n\nVerify it with your secret.',
    cites: ['webhooks'],
    feedback: -1,
    latencyMs: 1400,
    minutesAgo: 150,
    page: `https://${HOST}/webhooks`,
  },
  {
    question: 'Do you have a Slack integration',
    answered: false,
    latencyMs: 900,
    minutesAgo: 140,
    page: `https://${HOST}/pricing`,
  },
  {
    question: 'Can I export conversations to CSV?',
    answered: false,
    latencyMs: 700,
    minutesAgo: 130,
    page: `https://${HOST}/pricing`,
  },
  { question: 'slack integration?', answered: false, latencyMs: 600, minutesAgo: 120 },
  {
    question: 'Is there a Slack integration?',
    answered: false,
    latencyMs: 800,
    minutesAgo: 110,
    page: `https://${HOST}/webhooks#retries`,
  },
  {
    question: 'How do I verify webhook signatures?',
    answered: true,
    answer: '1. Read the `X-Signature` header [1].\n2. Compare it with an HMAC of the body [2].',
    cites: ['webhooks', 'faq'],
    feedback: -1,
    latencyMs: 2000,
    minutesAgo: 100,
  },
  {
    question: 'Which keys can read webhooks?',
    answered: true,
    cites: ['stale'],
    latencyMs: 1600,
    minutesAgo: 90,
  },
  // Stopped by the reader: a question, but no finished answer, so no rate or time.
  { question: 'Tell me everything', answered: null, latencyMs: 50, minutesAgo: 80 },
];

/** The week before, for the changes. */
const WEEK_BEFORE: Exchange[] = [
  {
    question: 'How do I rotate an API key?',
    answered: true,
    cites: ['legacy'],
    feedback: 1,
    latencyMs: 3000,
    minutesAgo: 9 * 24 * 60,
  },
  {
    question: 'What is the rate limit?',
    answered: false,
    latencyMs: 2000,
    minutesAgo: 9 * 24 * 60 - 5,
  },
];

const seed = async (service: SupabaseClient, email: string): Promise<Seeded> => {
  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (error || !created.user) {
    throw new Error(error?.message ?? 'The throwaway account could not be created.');
  }

  const userId = created.user.id;
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();
  const at = (minutesAgo: number, plusSeconds = 0) =>
    new Date(now - minutesAgo * MINUTE + plusSeconds * 1000).toISOString();

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
        name: 'Acme Docs (overview e2e)',
        slug: `overview-e2e-${tag}`,
        lead_capture: true,
      })
      .select('id')
      .single(),
  );
  const empty = must(
    await service
      .from('assistants')
      .insert({
        owner_id: userId,
        name: 'Quiet Docs (overview e2e)',
        slug: `overview-quiet-${tag}`,
      })
      .select('id')
      .single(),
  );
  const assistantId = assistant.id as string;
  const owned = { assistant_id: assistantId, owner_id: userId };

  const site = must(
    await service
      .from('sources')
      .insert({ ...owned, kind: 'url', title: HOST, uri: `https://${HOST}`, status: 'ready' })
      .select('id')
      .single(),
  );
  const notes = must(
    await service
      .from('sources')
      .insert({
        ...owned,
        kind: 'text',
        title: 'FAQ',
        storage_path: `overview-${tag}`,
        status: 'ready',
      })
      .select('id')
      .single(),
  );

  const doc = (key: string, title: string, url: string | null, source: string, age: number) => ({
    ...owned,
    source_id: source,
    title,
    url,
    content: `${title} page.`,
    checksum: `${tag}-${key}`,
    created_at: new Date(now - age * DAY).toISOString(),
  });
  const documents = must(
    await service
      .from('documents')
      .insert([
        doc('auth', 'Authentication', `https://${HOST}/auth`, site.id, 20),
        doc('webhooks', 'Webhooks', `https://${HOST}/webhooks`, site.id, 20),
        doc('legacy', 'Legacy SDK', `https://${HOST}/legacy`, site.id, 20),
        doc('changelog', 'Changelog 2024', `https://${HOST}/changelog`, site.id, 19),
        doc('faq', 'FAQ', null, notes.id, 18),
      ])
      .select('id, title, url'),
  );
  const documentId = (title: string) => documents.find((row) => row.title === title)!.id as string;
  const citation = (key: NonNullable<Exchange['cites']>[number], index: number) => {
    if (key === 'stale') {
      // Re-indexing a changed page gives it a new id; the address still names it.
      return {
        index,
        documentId: crypto.randomUUID(),
        title: 'Authentication',
        url: `https://${HOST}/auth`,
        snippet: 'Keys…',
      };
    }

    const title = {
      auth: 'Authentication',
      webhooks: 'Webhooks',
      faq: 'FAQ',
      legacy: 'Legacy SDK',
    }[key];

    return {
      index,
      documentId: documentId(title),
      title,
      url: key === 'faq' ? null : `https://${HOST}/${key}`,
      snippet: `${title}…`,
    };
  };

  let disliked: { conversationId: string; messageId: string } | null = null;

  for (const exchange of [...THIS_WEEK, ...WEEK_BEFORE]) {
    const conversation = must(
      await service
        .from('conversations')
        .insert({
          ...owned,
          channel: exchange.page ? 'widget' : 'app',
          visitor_id: exchange.page ? `visitor-${tag}` : null,
          page_url: exchange.page ?? null,
          title: exchange.question,
          created_at: at(exchange.minutesAgo),
        })
        .select('id')
        .single(),
    );
    const cites = exchange.cites ?? [];
    const answer =
      exchange.answer ??
      (exchange.answered === false
        ? 'I could not find that in the documentation.'
        : `The answer to ${exchange.question} ${cites.map((_, index) => `[${index + 1}]`).join('')}`);

    must(
      await service
        .from('messages')
        .insert({
          ...owned,
          conversation_id: conversation.id,
          role: 'user',
          content: exchange.question,
          created_at: at(exchange.minutesAgo),
        })
        .select('id'),
    );

    const reply = must(
      await service
        .from('messages')
        .insert({
          ...owned,
          conversation_id: conversation.id,
          role: 'assistant',
          content: answer,
          citations: cites.map((key, index) => citation(key, index + 1)),
          answered: exchange.answered,
          feedback: exchange.feedback ?? null,
          latency_ms: exchange.latencyMs,
          created_at: at(exchange.minutesAgo, 2),
        })
        .select('id')
        .single(),
    );

    if (exchange.question === 'How do I verify webhook signatures?') {
      disliked = { conversationId: conversation.id as string, messageId: reply.id as string };
    }
  }

  must(
    await service
      .from('leads')
      .insert([
        { ...owned, email: `reader-${tag}@acme.test`, status: 'new', created_at: at(60) },
        {
          ...owned,
          email: `earlier-${tag}@acme.test`,
          status: 'contacted',
          created_at: at(9 * 24 * 60),
        },
      ])
      .select('id'),
  );

  must(
    await service
      .from('usage_counters')
      .upsert({
        owner_id: userId,
        metric: 'messages',
        period_start: usagePeriodStart(),
        value: USED_THIS_MONTH,
      })
      .select('value'),
  );

  return {
    userId,
    assistantId,
    emptyAssistantId: empty.id as string,
    dislikedConversationId: disliked!.conversationId,
    dislikedMessageId: disliked!.messageId,
  };
};

const signIn = async (page: Page, email: string, next: string) => {
  await visit(page, `/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/[\]?]/g, '\\$&')}$`));
};

const section = (page: Page, testId: string) => page.getByTestId(testId);

const metric = (page: Page, testId: string) => {
  const node = section(page, 'answer-quality').getByTestId(testId);

  return {
    value: node.getByTestId('metric-value'),
    change: node.getByTestId('change'),
    caption: node.getByTestId('metric-caption'),
  };
};

const texts = (locator: Locator) => locator.allTextContents();

test.describe.configure({ mode: 'serial' });

test.describe('the Overview', () => {
  let service: SupabaseClient;
  let email: string;
  let seeded: Seeded;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const admin = adminClient();

    if (!admin) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed here.');
    }

    service = admin;
    email = testEmail('overview-e2e');
    seeded = await seed(service, email);
    page = await browser.newPage();
    await signIn(page, email, '/dashboard');
  });

  test.afterAll(async () => {
    await page?.close();

    if (email) {
      await removeAccount(email);
    }
  });

  test('answer quality: rates, ratings and time against the week before', async () => {
    await visit(page, `/a/${seeded.assistantId}?days=7`);

    // 5 answered of 9 finished (the stopped one is left out); the week before 1 of 2.
    const rate = metric(page, 'metric-answer-rate');
    await expect(rate.value).toHaveText('56%');
    await expect(rate.change).toHaveText('Up 6 pts on the 7 days before');
    await expect(rate.change).toHaveAttribute('data-tone', 'good');
    await expect(rate.caption).toHaveText('5 of 9 answers came from the docs.');

    // 2 up and 2 down; the week before 1 up.
    const helpful = metric(page, 'metric-helpful');
    await expect(helpful.value).toHaveText('50%');
    await expect(helpful.change).toHaveText('Down 50 pts on the 7 days before');
    await expect(helpful.change).toHaveAttribute('data-tone', 'bad');
    await expect(helpful.caption).toHaveText(
      '2 of 4 ratings were a thumb up. Too few ratings to read much into yet.',
    );

    // The median of the nine finished answers is 1,000 ms; the week before 2,500 ms.
    const time = metric(page, 'metric-time');
    await expect(time.value).toHaveText('1.0 s');
    await expect(time.change).toHaveText('Down 1.5 s on the 7 days before');
    await expect(time.change).toHaveAttribute('data-tone', 'good');

    await expect(
      section(page, 'answer-quality').getByRole('link', {
        name: 'Read the 4 unanswered questions in the Inbox',
      }),
    ).toHaveAttribute('href', `/a/${seeded.assistantId}/inbox?filter=unanswered`);

    // Ten questions in the trend's table, whatever days they fell on.
    await section(page, 'daily-chart').getByText('Show as a table').click();
    const perDay = await texts(section(page, 'daily-chart').locator('tbody tr td:nth-child(2)'));
    expect(perDay.reduce((sum, value) => sum + Number(value), 0)).toBe(10);
  });

  test('knowledge gaps: three wordings of one question are one gap, with Add docs', async () => {
    const gaps = section(page, 'knowledge-gaps');

    await expect(gaps.getByTestId('section-count')).toHaveText('2');

    const rows = gaps.getByTestId('gap-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Is there a Slack integration?');
    await expect(rows.nth(0).getByTestId('gap-asks')).toHaveText('3 times');
    await expect(rows.nth(0)).toContainText('Also asked as “slack integration?” and 1 more');
    await expect(rows.nth(0).locator('time')).toHaveText('1 hr ago');
    await expect(rows.nth(1)).toContainText('Can I export conversations to CSV?');
    await expect(rows.nth(1).getByTestId('gap-asks')).toHaveText('1 time');

    // The gap links to the conversation it was last asked in.
    const { data } = await service
      .from('conversations')
      .select('id')
      .eq('assistant_id', seeded.assistantId)
      .eq('title', 'Is there a Slack integration?')
      .single();
    await expect(rows.nth(0)).toHaveAttribute(
      'href',
      `/a/${seeded.assistantId}/inbox/${data!.id as string}`,
    );

    await gaps.getByRole('link', { name: 'Add docs' }).click();
    await expect(page).toHaveURL(new RegExp(`/a/${seeded.assistantId}/knowledge\\?add=url$`));
    const dialog = page.getByRole('dialog', { name: 'Add source' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab', { name: /Website/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Closed, it stays closed after a reload.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/a/${seeded.assistantId}/knowledge$`));
  });

  test('disliked answers: newest first, with the first line, linked to the answer itself', async () => {
    await visit(page, `/a/${seeded.assistantId}?days=7`);

    const disliked = section(page, 'disliked-answers');
    await expect(disliked.getByTestId('section-count')).toHaveText('2');

    const rows = disliked.getByTestId('disliked-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('How do I verify webhook signatures?');
    await expect(rows.nth(0)).toContainText('Read the X-Signature header.');
    await expect(rows.nth(1)).toContainText('How are webhooks signed?');
    await expect(rows.nth(1)).toContainText('Each webhook carries a signature header.');

    await rows.nth(0).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/a/${seeded.assistantId}/inbox/${seeded.dislikedConversationId}#message-${seeded.dislikedMessageId}$`,
      ),
    );
    await expect(page.locator(`#message-${seeded.dislikedMessageId}`)).toBeInViewport();
    await expect(page.locator(`#message-${seeded.dislikedMessageId}`)).toContainText('Not helpful');
  });

  test('content: the most cited pages and the pages no answer used', async () => {
    await visit(page, `/a/${seeded.assistantId}?days=7`);

    const cited = section(page, 'cited-documents');
    await expect(cited).toContainText('Most cited: 3 pages used in answers');
    // Authentication counts the answer that cited it through its replaced id; an answer that
    // cites a page twice counts once.
    await expect(cited.getByTestId('cited-row')).toHaveCount(3);
    expect(await texts(cited.getByTestId('cited-row').locator('a'))).toEqual([
      'Authentication',
      'Webhooks',
      'FAQ',
    ]);
    expect(await texts(cited.getByTestId('cited-answers'))).toEqual([
      '3 answers',
      '2 answers',
      '1 answer',
    ]);
    await expect(cited.getByRole('link', { name: 'Authentication' })).toHaveAttribute(
      'href',
      `https://${HOST}/auth`,
    );

    // Legacy SDK was cited only the week before.
    const uncited = section(page, 'uncited-documents');
    await expect(uncited).toContainText('Never cited: 2 of 5 indexed pages');
    expect(await texts(uncited.getByTestId('uncited-row').locator('a'))).toEqual([
      'Legacy SDK',
      'Changelog 2024',
    ]);
  });

  test('where readers ask: widget pages by path, with the answer rate on each', async () => {
    const pages = section(page, 'reader-pages');
    const rows = pages.getByTestId('page-row');

    await expect(pages.getByTestId('section-count')).toHaveText('3');
    await expect(rows).toHaveCount(3);
    // Query, fragment and a trailing slash do not split a page; the latest ask comes first.
    expect(await texts(rows.locator('td:first-child a'))).toEqual([
      '/webhooks',
      '/pricing',
      '/auth',
    ]);
    expect(await texts(pages.getByTestId('page-questions'))).toEqual(['2', '2', '2']);
    expect(
      (await texts(pages.getByTestId('page-rate'))).map((text) => text.replace(' (low)', '')),
    ).toEqual(['50%', '0%', '100%']);
    await expect(pages.getByTestId('page-rate').nth(1)).toContainText('(low)');
  });

  test('usage against the plan and leads', async () => {
    const before = new Date();

    await visit(page, `/a/${seeded.assistantId}?days=7`);

    const after = new Date();
    const usage = section(page, 'plan-usage');
    const limit = PLANS.starter.messagesPerMonth;

    await expect(usage.getByTestId('usage-used')).toHaveText(String(USED_THIS_MONTH));
    // The page projects at the moment it rendered, somewhere between these two.
    const expected = [before, after].map(
      (now) =>
        `At this pace you will use about ${projectUsage({ used: USED_THIS_MONTH, limit, now }).projected.toLocaleString('en-US')} of ${limit.toLocaleString('en-US')} this month`,
    );
    const projection = (await usage.getByTestId('usage-projection').textContent()) ?? '';
    expect(expected.some((text) => projection.startsWith(text))).toBe(true);

    const leads = section(page, 'leads-summary');
    await expect(leads.getByTestId('leads-count')).toHaveText('1');
    await expect(leads.getByTestId('leads-caption')).toHaveText('1 not contacted yet.');
    await expect(leads.getByRole('link', { name: 'Open leads' })).toHaveAttribute(
      'href',
      `/a/${seeded.assistantId}/inbox?tab=leads`,
    );
  });

  test('the 30-day period takes in the week before too', async () => {
    await visit(page, `/a/${seeded.assistantId}?days=7`);
    await page.getByRole('link', { name: '30 days' }).click();
    await expect(page).toHaveURL(new RegExp(`/a/${seeded.assistantId}\\?days=30$`));

    // 6 answered of 11 finished, and nothing in the 30 days before that.
    await expect(metric(page, 'metric-answer-rate').value).toHaveText('55%');
    await expect(metric(page, 'metric-answer-rate').change).toHaveText(
      'Nothing to compare with in the 30 days before',
    );
    await expect(section(page, 'knowledge-gaps').getByTestId('section-count')).toHaveText('3');
    await expect(section(page, 'uncited-documents')).toContainText(
      'Never cited: 1 of 5 indexed pages',
    );
    await expect(section(page, 'leads-summary').getByTestId('leads-count')).toHaveText('2');
  });

  test('an assistant with no traffic yet shows the first-use state', async () => {
    await visit(page, `/a/${seeded.emptyAssistantId}`);

    await expect(page.getByTestId('first-use')).toBeVisible();
    await expect(page.getByTestId('answer-quality')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Period' })).toHaveCount(0);
  });
});
