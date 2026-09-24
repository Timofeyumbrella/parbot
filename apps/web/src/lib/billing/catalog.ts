import type { PlanId } from '@parbot/shared';

import type { BillingInterval, PaidPlanId } from './types';

type Env = Record<string, string | undefined>;

/** Which environment variable holds the Stripe price id for each paid plan and interval. */
export const PRICE_ENV_KEYS: Record<PaidPlanId, Record<BillingInterval, string>> = {
  starter: { monthly: 'STRIPE_PRICE_STARTER_MONTHLY', yearly: 'STRIPE_PRICE_STARTER_YEARLY' },
  growth: { monthly: 'STRIPE_PRICE_GROWTH_MONTHLY', yearly: 'STRIPE_PRICE_GROWTH_YEARLY' },
};

export const PAID_PLAN_IDS: PaidPlanId[] = ['starter', 'growth'];
export const BILLING_INTERVALS: BillingInterval[] = ['monthly', 'yearly'];

/** The lookup key the seed script gives each price, so the catalog survives a Stripe account reset. */
export const lookupKeyFor = (plan: PaidPlanId, interval: BillingInterval) => `${plan}_${interval}`;

export type CatalogEntry = { planId: PaidPlanId; interval: BillingInterval; priceId: string };

/** Every price id that is configured. Missing entries are left out rather than failing. */
export const priceCatalog = (env: Env = process.env): CatalogEntry[] =>
  PAID_PLAN_IDS.flatMap((planId) =>
    BILLING_INTERVALS.flatMap((interval) => {
      const priceId = env[PRICE_ENV_KEYS[planId][interval]]?.trim();

      return priceId ? [{ planId, interval, priceId }] : [];
    }),
  );

export const priceIdFor = (
  plan: PlanId,
  interval: BillingInterval,
  env: Env = process.env,
): string => {
  if (plan === 'hobby') {
    throw new Error('Hobby is free and has no Stripe price.');
  }

  const key = PRICE_ENV_KEYS[plan][interval];
  const priceId = env[key]?.trim();

  if (!priceId) {
    throw new Error(
      `Missing environment variable ${key}. Run "pnpm --filter web stripe:seed" and paste its output into .env.`,
    );
  }

  return priceId;
};

/** The plan and interval a Stripe price id stands for, or null when the id is not in the catalog. */
export const planForPriceId = (
  priceId: string | null | undefined,
  env: Env = process.env,
): { planId: PaidPlanId; interval: BillingInterval } | null => {
  if (!priceId) {
    return null;
  }

  const entry = priceCatalog(env).find((candidate) => candidate.priceId === priceId);

  return entry ? { planId: entry.planId, interval: entry.interval } : null;
};
