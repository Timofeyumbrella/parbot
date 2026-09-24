import type Stripe from 'stripe';

import type { Enums } from '@/lib/db';

import { planForPriceId } from './catalog';
import type { SubscriptionPatch } from './store';

/** The parts of a Stripe subscription the account row is derived from. */
export type SubscriptionSnapshot = {
  id: string;
  customerId: string | null;
  status: Stripe.Subscription.Status;
  priceId: string | null;
  cancelAtPeriodEnd: boolean;
  /** Unix seconds. Current API versions put it on the subscription item, older ones on the subscription. */
  currentPeriodEnd: number | null;
  /** The account id Checkout attached as subscription metadata. */
  accountId: string | null;
};

const unixSeconds = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export const snapshotSubscription = (subscription: Stripe.Subscription): SubscriptionSnapshot => {
  const item = subscription.items?.data?.[0];
  const customer = subscription.customer;
  // A webhook endpoint pinned to an API version before 2025-03-31 still sends the period on the
  // subscription itself, which the current SDK types no longer declare.
  const legacyPeriodEnd = (subscription as { current_period_end?: unknown }).current_period_end;

  return {
    id: subscription.id,
    customerId: typeof customer === 'string' ? customer : (customer?.id ?? null),
    status: subscription.status,
    priceId: item?.price?.id ?? null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    currentPeriodEnd: unixSeconds(item?.current_period_end) ?? unixSeconds(legacyPeriodEnd),
    accountId: subscription.metadata?.account_id?.trim() || null,
  };
};

/**
 * Stripe statuses that keep the plan versus the ones that end it. `paused` is not in our enum;
 * a paused subscription no longer entitles the account, so it ends like a cancellation.
 */
export const mapSubscriptionStatus = (status: Stripe.Subscription.Status): Enums<'subscription_status'> => {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'incomplete':
      return 'incomplete';
    default:
      return 'canceled';
  }
};

export type PatchOptions = {
  env?: Record<string, string | undefined>;
  log?: (message: string) => void;
};

/** Everything the subscriptions row should hold for this Stripe subscription. Pure and idempotent. */
export const patchFromSnapshot = (
  snapshot: SubscriptionSnapshot,
  { env = process.env, log = console.warn }: PatchOptions = {},
): SubscriptionPatch => {
  const catalog = planForPriceId(snapshot.priceId, env);

  if (!catalog && snapshot.priceId) {
    log(`Stripe price ${snapshot.priceId} on subscription ${snapshot.id} is not in the catalog; treating it as Hobby.`);
  }

  const status = mapSubscriptionStatus(snapshot.status);
  const ended = status === 'canceled';

  return {
    plan_id: ended ? 'hobby' : (catalog?.planId ?? 'hobby'),
    status,
    billing_interval: ended ? null : (catalog?.interval ?? null),
    stripe_subscription_id: snapshot.id,
    ...(snapshot.customerId ? { stripe_customer_id: snapshot.customerId } : {}),
    current_period_end: snapshot.currentPeriodEnd ? new Date(snapshot.currentPeriodEnd * 1000).toISOString() : null,
    cancel_at_period_end: snapshot.cancelAtPeriodEnd,
  };
};

/** True when applying the patch would leave the row as it is. */
export const patchMatchesRow = (patch: SubscriptionPatch, row: Record<string, unknown>) =>
  Object.entries(patch).every(([key, value]) => {
    const current = row[key];

    if (key === 'current_period_end' && typeof value === 'string' && typeof current === 'string') {
      return new Date(value).getTime() === new Date(current).getTime();
    }

    return current === value;
  });
