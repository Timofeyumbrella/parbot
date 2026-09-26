import { expect, test } from '@playwright/test';

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

test.describe('the live demo in the hero', () => {
  test.skip(!process.env.NEXT_PUBLIC_DEMO_ASSISTANT_KEY, 'Needs NEXT_PUBLIC_DEMO_ASSISTANT_KEY.');

  test('lists each cited page once, markers ascending', async ({ page }) => {
    const citation = (index: number, slug: string, title: string) => ({
      index,
      documentId: slug,
      title,
      url: `https://docs.acme.test/${slug}`,
      snippet: '',
    });
    const events = [
      {
        type: 'token',
        text: 'Paste the script tag [2] with your public key [3], then reload [1].',
      },
      {
        type: 'citations',
        citations: [
          citation(2, 'install', 'Installing the widget'),
          citation(3, 'keys', 'Public keys'),
          citation(1, 'install', 'Installing the widget'),
        ],
      },
      { type: 'done', answered: true, latencyMs: 5 },
    ];

    // The answer's citation order is the model's; a fixed stream pins the case that duplicated.
    await page.route('**/api/widget/chat', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
      }),
    );
    await page.goto('/');

    const input = page.getByRole('textbox', { name: 'Ask a question' });

    // A production build hydrates quickly, but a submit that lands before React is lost.
    await expect(async () => {
      await input.fill('How do I install the widget?');
      await input.press('Enter');
      await expect(page.getByRole('list', { name: 'Sources' })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });

    await expect(page.getByRole('list', { name: 'Sources' }).getByRole('listitem')).toHaveText([
      '12Installing the widget',
      '3Public keys',
    ]);
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
});
