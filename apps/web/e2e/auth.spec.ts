import { expect, test } from '@playwright/test';

import { authErrorMessage } from '../src/components/auth/auth-errors';

import { trackAccounts } from './support/accounts';

const accounts = trackAccounts();

test.afterEach(accounts.cleanup);

test.describe('signing up and creating the first assistant', () => {
  test('a new visitor lands on onboarding, creates an assistant and sees the dashboard', async ({
    page,
  }) => {
    const email = accounts.email('e2e');
    test.info().annotations.push({ type: 'account', description: email });

    await page.goto('/signup');
    await expect(page.getByText('Create your account')).toBeVisible();

    await page.getByLabel(/full name/i).fill('E2E Tester');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password/i).fill('correct-horse-battery');
    await page.getByRole('button', { name: /create account|sign up|start/i }).click();

    await expect(page).toHaveURL(/\/onboarding/);

    await page.getByLabel('Name', { exact: true }).fill('Acme Docs');
    await page.getByRole('button', { name: /create/i }).click();

    await expect(page).toHaveURL(/\/a\/[0-9a-f-]{36}\/knowledge/);

    await page.goto('/dashboard');
    await expect(page.getByText('Acme Docs').first()).toBeVisible();
  });

  test('guarded routes bounce to login and keep the destination', async ({ page }) => {
    await page.goto('/billing');
    await expect(page).toHaveURL(/\/login\?next=%2Fbilling/);
  });

  test('a wrong password is explained inline', async ({ page }) => {
    const message = authErrorMessage({ code: 'invalid_credentials' });

    await page.goto('/login');
    await expect(page.getByText(message)).toHaveCount(0);

    await page.getByLabel(/email/i).fill('demo@parbot.dev');
    await page.getByLabel(/^password/i).fill('not-the-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    // The form's own alert, not a label that is on the page before anything is sent.
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled();
    await expect(page).toHaveURL(/\/login/);
  });
});
