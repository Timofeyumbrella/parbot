import { expect, type Page, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { adminClient, trackAccounts } from './support/accounts';
import { visit } from './support/navigation';

const accounts = trackAccounts();

// A failed assertion must not leave its account behind in the shared database.
test.afterEach(accounts.cleanup);

const admin = (): SupabaseClient => {
  const client = adminClient();

  if (!client) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to run the billing spec.',
    );
  }

  return client;
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

const signUp = async (page: Page, email: string) => {
  await visit(page, '/signup');
  await page.getByLabel(/full name/i).fill('Billing Tester');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password/i).fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/onboarding/);
};

test.describe('billing in test mode', () => {
  test('a new account moves from Hobby to Starter and back', async ({ page }) => {
    const service = admin();
    const email = accounts.email('e2e-billing');
    // The plan picker lists every plan by name and price, so only this card proves the current one.
    const currentPlan = page.getByTestId('current-plan');

    await signUp(page, email);

    await visit(page, '/billing');
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
    await visit(page, '/account');
    await expect(page.getByText(`Starter, $29 a month. ${renewal}`)).toBeVisible();

    await visit(page, '/billing');
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
  });

  test('an unpaid first payment leaves every screen on Hobby', async ({ page }) => {
    const service = admin();
    const email = accounts.email('e2e-billing-unpaid');
    const currentPlan = page.getByTestId('current-plan');

    await signUp(page, email);
    const id = await accountIdOf(service, email);

    if (!id) {
      throw new Error(`Signing up ${email} did not create a profile.`);
    }

    // A row as Stripe's 'incomplete' status would leave it if the paid plan were written with it.
    const { error } = await service
      .from('subscriptions')
      .update({
        plan_id: 'starter',
        billing_interval: 'monthly',
        status: 'incomplete',
        stripe_customer_id: `cus_e2e_${id.slice(0, 8)}`,
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('account_id', id);
    expect(error).toBeNull();

    await visit(page, '/billing');
    await expect(currentPlan).toContainText('Hobby');
    await expect(currentPlan).toContainText('Payment pending');
    await expect(currentPlan).toContainText('so you are on Hobby');
    await expect(currentPlan).not.toContainText('Starter');
    await expect(page.getByTestId('plan-hobby')).toHaveAttribute('data-current', 'true');
    await expect(page.getByRole('link', { name: /^Billing/ })).toContainText('Hobby');

    await visit(page, '/account');
    await expect(
      page.getByText('Hobby, Free. Upgrade for more assistants, pages and answers.'),
    ).toBeVisible();
  });

  test('the Stripe webhook refuses a forged event without saying how billing is set up', async ({
    request,
  }) => {
    const forged = await request.post('/api/stripe/webhook', {
      headers: { 'stripe-signature': 't=1700000000,v1=forged' },
      data: { id: 'evt_forged', type: 'checkout.session.completed', data: { object: {} } },
    });

    // The same answer whether or not a webhook secret is configured on this server.
    expect(forged.status()).toBe(400);
    expect(await forged.json()).toEqual({ error: 'Invalid Stripe signature.' });

    const unsigned = await request.post('/api/stripe/webhook', { data: {} });

    expect(unsigned.status()).toBe(400);
    expect(await unsigned.json()).toEqual({ error: 'Missing Stripe signature.' });
  });
});
