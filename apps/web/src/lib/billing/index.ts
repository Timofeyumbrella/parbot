import 'server-only';

import { serverEnv } from '@/lib/env';

import { createMockProvider } from './mock';
import { createStripeProvider } from './stripe';
import type { BillingProvider, BillingProviderName } from './types';

export { lookupKeyFor, planForPriceId, priceCatalog, priceIdFor } from './catalog';
export { createMockProvider } from './mock';
export { billingReturnUrl, trustedOrigin } from './return-url';
export { createSubscriptionStore, type SubscriptionPatch, type SubscriptionStore } from './store';
export { createStripeProvider, getStripe, retrieveSubscription } from './stripe';
export {
  type BillingInterval,
  type BillingProvider,
  type BillingProviderName,
  BillingError,
  type CheckoutParams,
  isBillingInterval,
  isPaidPlanId,
  type PaidPlanId,
  type PortalParams,
} from './types';
export { handleStripeEvent, type WebhookDeps, type WebhookOutcome } from './webhook';

let warnedAboutMissingKey = false;

/**
 * Stripe only when BILLING_PROVIDER=stripe and a key is present. Everything else runs on the
 * mock provider so every flow works without a Stripe account.
 */
export const billingProviderName = (): BillingProviderName => {
  const env = serverEnv();

  if (env.billingProvider === 'stripe' && env.stripeSecretKey) {
    return 'stripe';
  }

  if (env.billingProvider === 'stripe' && !warnedAboutMissingKey) {
    warnedAboutMissingKey = true;
    console.warn(
      'BILLING_PROVIDER=stripe but STRIPE_SECRET_KEY is empty; billing runs on the mock provider.',
    );
  }

  return 'mock';
};

export const createBillingProvider = (): BillingProvider =>
  billingProviderName() === 'stripe' ? createStripeProvider() : createMockProvider();
