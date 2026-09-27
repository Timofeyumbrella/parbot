import { expect, type Page, test } from '@playwright/test';

import { formatPrice, PLANS } from '../src/lib/plans';

import { visit } from './support/navigation';

test.describe('landing page', () => {
  test('presents the product and the three plans with their prices', async ({ page }) => {
    await visit(page, '/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    for (const plan of Object.values(PLANS)) {
      await expect(page.getByText(plan.name, { exact: true }).first()).toBeVisible();
    }

    await expect(page.getByText('$29').first()).toBeVisible();
    await expect(page.getByText('$99').first()).toBeVisible();
  });

  test('the yearly toggle changes the amounts', async ({ page }) => {
    await visit(page, '/');

    const yearly = page
      .getByRole('group', { name: 'Billing interval' })
      .getByRole('button', { name: /yearly/i });

    await expect(yearly).toHaveAttribute('aria-pressed', 'false');

    // The dev server hydrates after the page is actionable and swallows a click that lands
    // first. The toggle's pressed state says when React has taken the click.
    await expect(async () => {
      await yearly.click();
      await expect(yearly).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });

    for (const plan of [PLANS.starter, PLANS.growth]) {
      await expect(page.getByTestId(`plan-${plan.id}`).getByTestId('plan-price')).toContainText(
        formatPrice(plan.yearlyCents),
      );
    }
  });

  test('the primary call to action leads to sign up', async ({ page }) => {
    await visit(page, '/');

    await page
      .getByRole('link', { name: /start free/i })
      .first()
      .click();

    await expect(page).toHaveURL(/\/signup/);
  });
});

test.describe('the scripted demo in the hero', () => {
  const demo = (page: Page) => page.getByRole('figure', { name: /example conversation/i });
  const frame = (page: Page) => demo(page).getByTestId('demo-frame');
  const questions = (page: Page) => frame(page).getByTestId('demo-user-message');

  /** Every request to the chat endpoints, from the hero or anything else on the page. */
  const watchChatRequests = (page: Page) => {
    const sent: string[] = [];

    page.on('request', (request) => {
      if (/\/api\/(widget\/)?chat\b/.test(request.url())) {
        sent.push(request.url());
      }
    });

    return sent;
  };

  test('shows a finished, cited exchange on fictional docs, then plays the next one on its own', async ({
    page,
  }) => {
    const sent = watchChatRequests(page);

    await visit(page, '/');

    await expect(frame(page)).toHaveAttribute('inert', '');
    await expect(frame(page)).toContainText('Northwind Payments');
    await expect(frame(page).getByTestId('demo-sources-strip')).toContainText('4 sources ready');
    await expect(frame(page).getByTestId('demo-sources-strip')).toContainText('api-reference.pdf');
    await expect(questions(page)).toHaveText(['How do I refund part of a payment?']);
    await expect(frame(page).getByTestId('demo-code-block')).toContainText('curl');
    await expect(frame(page).getByTestId('demo-sources').getByRole('listitem')).toHaveText([
      '1api-reference.pdf',
      '2auth-guide.docx',
    ]);
    // Nothing in the hero takes typing or a click.
    await expect(demo(page).locator('input, textarea, button, a')).toHaveCount(0);
    await expect(
      page.locator('section[aria-labelledby="hero-heading"]').getByRole('textbox'),
    ).toHaveCount(0);

    // The next question types itself, is sent, and its answer streams in with grouped sources.
    await expect(frame(page).getByTestId('demo-composer')).toContainText('How do I verify', {
      timeout: 10_000,
    });
    await expect(questions(page)).toHaveText(
      ['How do I refund part of a payment?', 'How do I verify a webhook signature?'],
      { timeout: 10_000 },
    );
    await expect(frame(page).getByTestId('demo-sources').nth(1).getByRole('listitem')).toHaveText(
      ['13webhooks.md', '2Changelogdocs.northwind.dev'],
      { timeout: 15_000 },
    );

    // The docs do not cover the third: the assistant says so and the email offer is filled in.
    await expect(frame(page).getByTestId('demo-lead-thanks')).toHaveText(
      'Thanks. The team will reply to dana@example.com.',
      { timeout: 30_000 },
    );
    expect(sent).toEqual([]);
  });

  test('holds still while scrolled out of view', async ({ page }) => {
    await visit(page, '/');
    await expect(questions(page)).toHaveCount(2, { timeout: 15_000 });

    await page.locator('footer').last().scrollIntoViewIfNeeded();
    await expect(frame(page)).not.toBeInViewport();
    // The observer reports the scroll asynchronously; give it a moment before taking the snapshot.
    await page.waitForTimeout(500);

    const before = await frame(page).innerText();

    await page.waitForTimeout(5_000);
    expect(await frame(page).innerText()).toBe(before);

    await demo(page).scrollIntoViewIfNeeded();
    await expect.poll(() => frame(page).innerText(), { timeout: 15_000 }).not.toBe(before);
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('shows the first exchange finished and never moves', async ({ page }) => {
      await visit(page, '/');
      await expect(frame(page).getByTestId('demo-sources')).toBeVisible();

      const before = await frame(page).innerText();

      await page.waitForTimeout(6_000);
      expect(await frame(page).innerText()).toBe(before);
      await expect(questions(page)).toHaveText(['How do I refund part of a payment?']);
    });
  });
});

test.describe('the demo palette on the landing page', () => {
  // A light OS is the case where the widget's own "auto" opened a white palette over the dark page.
  test.use({ colorScheme: 'light' });
  test.skip(!process.env.NEXT_PUBLIC_DEMO_ASSISTANT_KEY, 'Needs NEXT_PUBLIC_DEMO_ASSISTANT_KEY.');

  test('wears the page scheme, follows the toggle and stays on the landing', async ({ page }) => {
    const widget = page.locator('#parbot-widget');
    const palette = widget.locator('.pb-panel');
    const openPalette = async () => {
      await page.keyboard.press('ControlOrMeta+k');
      await expect(palette).toHaveClass(/pb-open/);
    };

    await visit(page, '/');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await expect(widget.locator('.pb-root')).toHaveAttribute('data-scheme', 'dark');

    await openPalette();
    await expect(palette).toHaveCSS('background-color', 'rgb(28, 28, 33)');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Toggle colour scheme' }).first().click();
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    await openPalette();
    await expect(palette).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await page.keyboard.press('Escape');

    await page
      .getByRole('link', { name: /start free/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/signup/);
    await expect(widget).toHaveCount(0);
  });

  test('points a phone at the demo page instead of ⌘K, and a desktop at ⌘K', async ({ page }) => {
    const hero = page.locator('[aria-labelledby="hero-heading"]');
    const liveLink = hero.getByRole('link', { name: 'Try it live on the Parbot docs' });

    await page.setViewportSize({ width: 1280, height: 800 });
    await visit(page, '/');
    await expect(hero.getByTestId('palette-hint')).toBeVisible();
    await expect(liveLink).toBeHidden();

    // No pill below lg and no ⌘K on a phone: the hint gives way to a link that works by touch.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(hero.getByTestId('palette-hint')).toBeHidden();
    await expect(hero.getByText(/⌘K palette on this page/)).toBeHidden();
    await expect(liveLink).toBeVisible();

    await liveLink.click();
    await expect(page).toHaveURL(
      new RegExp(`/demo/${process.env.NEXT_PUBLIC_DEMO_ASSISTANT_KEY}\\?mode=bubble$`),
    );

    const launcher = page.locator('#parbot-widget .pb-launcher');
    await launcher.click();
    await expect(page.locator('#parbot-widget .pb-panel')).toHaveClass(/pb-open/);
  });
});
