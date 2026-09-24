import 'server-only';

import type { Subscription, TablesUpdate } from '@/lib/db';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type SubscriptionPatch = Pick<
  TablesUpdate<'subscriptions'>,
  | 'plan_id'
  | 'status'
  | 'billing_interval'
  | 'stripe_customer_id'
  | 'stripe_subscription_id'
  | 'current_period_end'
  | 'cancel_at_period_end'
>;

/**
 * The account's subscriptions row, read and written through the service role. Callers verify
 * ownership first: the webhook trusts Stripe's account id, the actions use the signed-in user.
 */
export type SubscriptionStore = {
  findByAccount(accountId: string): Promise<Subscription | null>;
  findByStripeSubscription(subscriptionId: string): Promise<Subscription | null>;
  findByStripeCustomer(customerId: string): Promise<Subscription | null>;
  save(accountId: string, patch: SubscriptionPatch): Promise<Subscription>;
};

export const createSubscriptionStore = (
  service = createSupabaseServiceClient(),
): SubscriptionStore => {
  const findBy = async (column: 'account_id' | 'stripe_subscription_id' | 'stripe_customer_id', value: string) => {
    const { data, error } = await service.from('subscriptions').select('*').eq(column, value).maybeSingle();

    if (error) {
      throw new Error(`Subscription lookup failed: ${error.message}`);
    }

    return data ?? null;
  };

  return {
    findByAccount: (accountId) => findBy('account_id', accountId),
    findByStripeSubscription: (subscriptionId) => findBy('stripe_subscription_id', subscriptionId),
    findByStripeCustomer: (customerId) => findBy('stripe_customer_id', customerId),
    save: async (accountId, patch) => {
      const { data, error } = await service
        .from('subscriptions')
        .upsert({ account_id: accountId, ...patch }, { onConflict: 'account_id' })
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(`Subscription could not be saved: ${error?.message ?? 'no row returned'}`);
      }

      return data;
    },
  };
};
