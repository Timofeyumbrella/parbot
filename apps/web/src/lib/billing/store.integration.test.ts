import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/db';

import { createSubscriptionStore } from './store';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Runs against the local Supabase stack with a throwaway user; skipped where there is none.
describe.skipIf(!serviceKey)('subscription store against the local database', () => {
  const service = createClient<Database>(url, serviceKey ?? 'missing', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store = createSubscriptionStore(service);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let accountId = '';

  beforeAll(async () => {
    const { data, error } = await service.auth.admin.createUser({
      email: `billing-store-${stamp}@test.parbot.dev`,
      password: `pw-${stamp}`,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(error?.message ?? 'no user');
    }

    accountId = data.user.id;
  });

  afterAll(async () => {
    if (accountId) {
      await service.auth.admin.deleteUser(accountId);
    }
  });

  it('starts every account on Hobby', async () => {
    const row = await store.findByAccount(accountId);

    expect(row).toMatchObject({
      account_id: accountId,
      plan_id: 'hobby',
      status: 'active',
      stripe_customer_id: null,
    });
  });

  it('saves a patch and finds the row by its Stripe ids', async () => {
    const saved = await store.save(accountId, {
      plan_id: 'growth',
      billing_interval: 'yearly',
      status: 'active',
      stripe_customer_id: `cus_${stamp}`,
      stripe_subscription_id: `sub_${stamp}`,
      current_period_end: '2027-03-01T00:00:00.000Z',
      cancel_at_period_end: false,
    });

    expect(saved).toMatchObject({ plan_id: 'growth', billing_interval: 'yearly' });
    expect(await store.findByStripeSubscription(`sub_${stamp}`)).toMatchObject({
      account_id: accountId,
    });
    expect(await store.findByStripeCustomer(`cus_${stamp}`)).toMatchObject({
      account_id: accountId,
    });
    expect(await store.findByStripeSubscription('sub_nobody')).toBeNull();
  });

  it('leaves untouched columns alone on a partial patch', async () => {
    await store.save(accountId, { plan_id: 'hobby', billing_interval: null, status: 'canceled' });

    expect(await store.findByAccount(accountId)).toMatchObject({
      plan_id: 'hobby',
      status: 'canceled',
      stripe_customer_id: `cus_${stamp}`,
      stripe_subscription_id: `sub_${stamp}`,
    });
  });

  it('refuses a paid plan without an interval', async () => {
    await expect(
      store.save(accountId, { plan_id: 'starter', billing_interval: null }),
    ).rejects.toThrow(/saved/);
  });
});
