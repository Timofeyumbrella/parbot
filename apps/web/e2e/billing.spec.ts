import { expect, type Page, test } from '@playwright/test';

import { priceLabel } from '../src/lib/billing/pricing';
import { PLANS } from '../src/lib/plans';

import { trackAccounts } from './support/accounts';

const accounts = trackAccounts();

test.afterEach(accounts.cleanup);

/** The "Current plan" card: the plan's name also appears in the picker, so it is read from here. */
const currentPlanCard = (page: Page) =>
  page
    .locator('[data-slot="card"]')
    .filter({ has: page.locator('[data-slot="card-title"]', { hasText: /^Current plan$/ }) });

test.describe('billing in test mode', () => {
  test('a new account moves from Hobby to Starter and back', async ({ page }) => {
    const email = accounts.email('e2e-billing');

    await page.goto('/signup');
    await page.getByLabel(/full name/i).fill('Billing Tester');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password/i).fill('correct-horse-battery');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/onboarding/);

    await page.goto('/billing');
    await expect(page.getByText(/test mode/i).first()).toBeVisible();

    const card = currentPlanCard(page);

    await expect(card).toHaveCount(1);
    await expect(card).toContainText(PLANS.hobby.name);
    await expect(card).toContainText('Free');

    await page.getByRole('button', { name: /choose starter/i }).click();
    await expect(page).toHaveURL(/mock_plan=starter/);
    await page.getByRole('button', { name: /apply/i }).click();

    await expect(page).toHaveURL(/checkout=success/);
    await expect(card).toContainText(PLANS.starter.name);
    await expect(card).toContainText(priceLabel(PLANS.starter, 'monthly'));

    await page.getByRole('button', { name: /manage subscription/i }).click();
    await expect(page).toHaveURL(/mock_portal=1/);
    await page
      .getByRole('button', { name: /switch to hobby/i })
      .first()
      .click();

    await expect(card).toContainText(PLANS.hobby.name);
    await expect(card).not.toContainText(PLANS.starter.name);
  });
});
