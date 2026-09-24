import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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

test.describe('billing in test mode', () => {
  test('a new account moves from Hobby to Starter and back', async ({ page }) => {
    const email = `e2e-billing-${unique()}@parbot.test`;

    try {
      await page.goto('/signup');
      await page.getByLabel(/full name/i).fill('Billing Tester');
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/^password/i).fill('correct-horse-battery');
      await page.getByRole('button', { name: /create account/i }).click();
      await expect(page).toHaveURL(/\/onboarding/);

      await page.goto('/billing');
      await expect(page.getByText(/test mode/i).first()).toBeVisible();
      await expect(page.getByText('Hobby').first()).toBeVisible();

      await page.getByRole('button', { name: /choose starter/i }).click();
      await expect(page).toHaveURL(/mock_plan=starter/);
      await page.getByRole('button', { name: /apply/i }).click();

      await expect(page).toHaveURL(/checkout=success/);
      await expect(page.getByText('$29').first()).toBeVisible();

      await page.getByRole('button', { name: /manage subscription/i }).click();
      await expect(page).toHaveURL(/mock_portal=1/);
      await page.getByRole('button', { name: /switch to hobby/i }).first().click();

      await expect(page.getByText('Hobby').first()).toBeVisible();
    } finally {
      await removeAccount(email);
    }
  });
});
