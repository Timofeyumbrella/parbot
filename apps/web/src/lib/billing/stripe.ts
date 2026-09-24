import 'server-only';

import Stripe from 'stripe';

import { serverEnv } from '@/lib/env';

import { priceIdFor } from './catalog';
import { createSubscriptionStore, type SubscriptionStore } from './store';
import { type BillingProvider, BillingError, withParams } from './types';

let cached: { key: string; client: Stripe } | null = null;

/** The Stripe client for the configured test key. Throws a clear error when there is none. */
export const getStripe = (): Stripe => {
  const key = serverEnv().stripeSecretKey;

  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set. Add a Stripe test key or set BILLING_PROVIDER=mock.');
  }

  if (cached?.key !== key) {
    cached = { key, client: new Stripe(key, { appInfo: { name: 'Parbot' } }) };
  }

  return cached.client;
};

export const retrieveSubscription = (subscriptionId: string) => getStripe().subscriptions.retrieve(subscriptionId);

type StripeProviderDeps = {
  stripe?: () => Stripe;
  store?: () => SubscriptionStore;
};

export const createStripeProvider = ({
  stripe = getStripe,
  store = createSubscriptionStore,
}: StripeProviderDeps = {}): BillingProvider => ({
  name: 'stripe',

  createCheckout: async ({ accountId, email, planId, interval, returnUrl }) => {
    const priceId = priceIdFor(planId, interval);
    const existing = await store().findByAccount(accountId);
    // Reusing a known customer keeps one customer per account instead of one per checkout.
    const customer = existing?.stripe_customer_id
      ? { customer: existing.stripe_customer_id }
      : email
        ? { customer_email: email }
        : {};

    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      ...customer,
      client_reference_id: accountId,
      metadata: { account_id: accountId },
      subscription_data: { metadata: { account_id: accountId } },
      success_url: withParams(returnUrl, { checkout: 'success' }),
      cancel_url: withParams(returnUrl, { checkout: 'cancelled' }),
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new Error(`Stripe returned checkout session ${session.id} without a URL.`);
    }

    return { url: session.url };
  },

  createPortal: async ({ accountId, returnUrl }) => {
    const existing = await store().findByAccount(accountId);

    if (!existing?.stripe_customer_id) {
      throw new BillingError('This account has no Stripe customer yet. Choose a plan first, then manage it here.');
    }

    const session = await stripe().billingPortal.sessions.create({
      customer: existing.stripe_customer_id,
      return_url: returnUrl,
    });

    return { url: session.url };
  },
});
