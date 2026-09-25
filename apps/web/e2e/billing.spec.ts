import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const admin = (): SupabaseClient => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to run the billing spec.',
    );
  }

  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

const accountIdOf = async (service: SupabaseClient, email: string) => {
  const { data } = await service.from('profiles').select('id').eq('email', email).maybeSingle();

  return data?.id ?? null;
};

/** The plan the database holds, so text the plan picker always renders cannot pass for a change. */
const storedPlan = async (service: SupabaseClient, email: string) => {
  const id = await accountIdOf(service, email);

  if (!id) {
    return null;
  }

  const { data } = await service
    .from('subscriptions')
    .select('plan_id')
    .eq('account_id', id)
    .maybeSingle();

  return data?.plan_id ?? null;
};

const removeAccount = async (service: SupabaseClient, email: string) => {
  const id = await accountIdOf(service, email);

  if (id) {
    await service.auth.admin.deleteUser(id);
  }
};

test.describe('billing in test mode', () => {
  test('a new account moves from Hobby to Starter and back', async ({ page }) => {
    const service = admin();
    const email = `e2e-billing-${unique()}@parbot.test`;
    // The plan picker lists every plan by name and price, so only this card proves the current one.
    const currentPlan = page.getByTestId('current-plan');

    try {
      await page.goto('/signup');
      await page.getByLabel(/full name/i).fill('Billing Tester');
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/^password/i).fill('correct-horse-battery');
      await page.getByRole('button', { name: /create account/i }).click();
      await expect(page).toHaveURL(/\/onboarding/);

      await page.goto('/billing');
      await expect(page.getByText(/test mode/i).first()).toBeVisible();
      await expect(currentPlan).toContainText('Hobby');
      await expect(currentPlan).toContainText('Free');
      await expect(page.getByTestId('plan-hobby')).toHaveAttribute('data-current', 'true');

      await page.getByRole('button', { name: /choose starter/i }).click();
      await expect(page).toHaveURL(/mock_plan=starter/);
      await page.getByRole('button', { name: /apply/i }).click();

      await expect(page).toHaveURL(/checkout=success/);
      await expect(currentPlan).toContainText('Starter');
      await expect(currentPlan).toContainText('$29 a month');
      await expect(currentPlan).toContainText(/Renews on [A-Z][a-z]{2} \d{1,2}, \d{4}\./);
      await expect(page.getByTestId('plan-starter')).toHaveAttribute('data-current', 'true');
      await expect(page.getByTestId('plan-hobby')).not.toHaveAttribute('data-current', 'true');
      await expect.poll(() => storedPlan(service, email)).toBe('starter');

      // The Account page describes the same subscription, with the date in the same shape.
      const renewal = (await currentPlan.getByText(/Renews on/).textContent())?.trim();
      await page.goto('/account');
      await expect(page.getByText(`Starter, $29 a month. ${renewal}`)).toBeVisible();

      await page.goto('/billing');
      await page.getByRole('button', { name: /manage subscription/i }).click();
      await expect(page).toHaveURL(/mock_portal=1/);
      await page
        .getByTestId('mock-portal-card')
        .getByRole('button', { name: /switch to hobby/i })
        .click();

      await expect(page).toHaveURL(/checkout=success/);
      await expect(currentPlan).toContainText('Hobby');
      await expect(currentPlan).not.toContainText('Starter');
      await expect(page.getByTestId('plan-hobby')).toHaveAttribute('data-current', 'true');
      await expect(page.getByTestId('plan-starter')).not.toHaveAttribute('data-current', 'true');
      await expect.poll(() => storedPlan(service, email)).toBe('hobby');
    } finally {
      await removeAccount(service, email);
    }
  });
});
