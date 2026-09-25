import { expect, test } from '@playwright/test';

import { formatPrice, PLANS } from '../src/lib/plans';

test.describe('landing page', () => {
  test('presents the product and the three plans with their prices', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    for (const plan of Object.values(PLANS)) {
      await expect(page.getByText(plan.name, { exact: true }).first()).toBeVisible();
    }

    await expect(page.getByText('$29').first()).toBeVisible();
    await expect(page.getByText('$99').first()).toBeVisible();
  });

  test('the yearly toggle changes the amounts', async ({ page }) => {
    await page.goto('/');

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
    await page.goto('/');

    await page
      .getByRole('link', { name: /start free/i })
      .first()
      .click();

    await expect(page).toHaveURL(/\/signup/);
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

    await page.goto('/');
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
