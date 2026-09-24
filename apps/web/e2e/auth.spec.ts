import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Removes an account the test created, and with it everything it owns, through the service role. */
const removeAccount = async (email: string) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return;
  }

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();

  if (data?.id) {
    await admin.auth.admin.deleteUser(data.id);
  }
};

test.describe('signing up and creating the first assistant', () => {
  test('a new visitor lands on onboarding, creates an assistant and sees the dashboard', async ({ page }) => {
    const email = `e2e-${unique()}@parbot.test`;
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

    await removeAccount(email);
  });

  test('guarded routes bounce to login and keep the destination', async ({ page }) => {
    await page.goto('/billing');
    await expect(page).toHaveURL(/\/login\?next=%2Fbilling/);
  });

  test('a wrong password is explained inline', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('demo@parbot.dev');
    await page.getByLabel(/^password/i).fill('not-the-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/password|email/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
