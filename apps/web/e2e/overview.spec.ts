import { expect, type Locator, type Page, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { projectUsage } from '../src/lib/overview';
import { PLANS } from '../src/lib/plans';

import { adminClient, removeAccount, testEmail } from './support/accounts';
import { visit } from './support/navigation';
import {
  HOST,
  must,
  PASSWORD,
  type Seeded,
  seedOverview,
  USED_THIS_MONTH,
} from './support/overview-seed';

/**
 * The Overview against rows whose every number is known: answered, unanswered (three wordings of
 * one question among them), rated up and down, stopped, citing several pages (one through an id
 * that re-indexing replaced), asked from several widget pages, a lead, and a previous week to
 * compare with. Each section's numbers on screen are checked against what was seeded.
 *
 * Runs as a throwaway account the spec creates and deletes, so the demo rows are never touched.
 */

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
    seeded = await seedOverview(service, email);
    page = await browser.newPage();
    // Sign-in lands on the account's one assistant.
    await signIn(page, email, `/a/${seeded.assistantId}`);
  });

  test.afterAll(async () => {
    await page?.close();

    if (email) {
      await removeAccount(email);
    }
  });

  test('answer quality: rates, ratings and time against the week before', async () => {
    // The Overview opens on the week, with no ?days= in the address.
    await visit(page, `/a/${seeded.assistantId}`);
    const period = page.getByRole('navigation', { name: 'Period' });
    await expect(period.getByRole('link', { name: '7 days' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(period.getByRole('link', { name: '30 days' })).not.toHaveAttribute('aria-current');

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
    await visit(page, `/a/${seeded.assistantId}`);
    await page.getByRole('link', { name: '30 days' }).click();
    await expect(page).toHaveURL(new RegExp(`/a/${seeded.assistantId}\\?days=30$`));
    await expect(page.getByRole('link', { name: '30 days' })).toHaveAttribute(
      'aria-current',
      'page',
    );

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

    // Back to the week: the default drops out of the address again.
    await page.getByRole('link', { name: '7 days' }).click();
    await expect(page).toHaveURL(new RegExp(`/a/${seeded.assistantId}$`));
    await expect(metric(page, 'metric-answer-rate').value).toHaveText('56%');
  });

  test('an assistant with no traffic yet shows the first-use state', async ({ browser }) => {
    // Its own account: an account may be limited to one assistant.
    const quietEmail = testEmail('overview-quiet');

    try {
      const { data: created, error } = await service.auth.admin.createUser({
        email: quietEmail,
        password: PASSWORD,
        email_confirm: true,
      });

      if (error || !created.user) {
        throw new Error(error?.message ?? 'The throwaway account could not be created.');
      }

      const quiet = must(
        await service
          .from('assistants')
          .insert({
            owner_id: created.user.id,
            name: 'Quiet Docs (overview e2e)',
            slug: `overview-quiet-${Date.now().toString(36)}`,
          })
          .select('id')
          .single(),
      );
      const quietPage = await browser.newPage();

      try {
        await signIn(quietPage, quietEmail, `/a/${quiet.id as string}`);
        await expect(quietPage.getByTestId('first-use')).toBeVisible();
        await expect(quietPage.getByTestId('answer-quality')).toHaveCount(0);
        await expect(quietPage.getByRole('navigation', { name: 'Period' })).toHaveCount(0);
      } finally {
        await quietPage.close();
      }
    } finally {
      await removeAccount(quietEmail);
    }
  });
});
