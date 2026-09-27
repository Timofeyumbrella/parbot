import { cache } from 'react';

import { entitledPlanId } from '@/lib/billing/entitlement';
import { type Plan, planFor, usagePeriodStart } from '@/lib/plans';
import { getSession } from '@/lib/session';

export type AccountPlan = {
  plan: Plan;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
  billingInterval: 'monthly' | 'yearly' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
};

/** The signed-in account's plan. A subscription that has ended or never been paid behaves like Hobby. */
export const getAccountPlan = cache(async (): Promise<AccountPlan> => {
  const { supabase, user } = await getSession();
  const fallback: AccountPlan = {
    plan: planFor('hobby'),
    status: 'active',
    billingInterval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    hasStripeCustomer: false,
  };

  if (!user) {
    return fallback;
  }

  const { data } = await supabase
    .from('subscriptions')
    .select(
      'plan_id, status, billing_interval, current_period_end, cancel_at_period_end, stripe_customer_id',
    )
    .eq('account_id', user.id)
    .maybeSingle();

  if (!data) {
    return fallback;
  }

  return {
    plan: planFor(entitledPlanId(data)),
    status: data.status,
    billingInterval: data.billing_interval,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
    hasStripeCustomer: Boolean(data.stripe_customer_id),
  };
});

export type AccountUsage = {
  pages: number;
  messagesThisMonth: number;
};

/** What the account has used against its plan. Counts through the visitor's own session. */
export const getAccountUsage = cache(async (): Promise<AccountUsage> => {
  const { supabase, user } = await getSession();

  if (!user) {
    return { pages: 0, messagesThisMonth: 0 };
  }

  const [pages, usage] = await Promise.all([
    supabase.from('documents').select('id', { count: 'exact', head: true }),
    supabase
      .from('usage_counters')
      .select('value')
      .eq('owner_id', user.id)
      .eq('metric', 'messages')
      .eq('period_start', usagePeriodStart())
      .maybeSingle(),
  ]);

  return {
    pages: pages.count ?? 0,
    messagesThisMonth: Number(usage.data?.value ?? 0),
  };
});
