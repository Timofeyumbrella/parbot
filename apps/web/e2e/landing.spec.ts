import { expect, test } from '@playwright/test';

import { PLANS } from '../src/lib/plans';

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

    await page.getByRole('button', { name: /yearly/i }).click();

    await expect(page.getByText('$290').first()).toBeVisible();
    await expect(page.getByText('$990').first()).toBeVisible();
  });

  test('the primary call to action leads to sign up', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: /start free/i }).first().click();

    await expect(page).toHaveURL(/\/signup/);
  });
});
