import { UUID_PATTERN } from '@parbot/shared';
import type Stripe from 'stripe';

import type { SubscriptionPatch, SubscriptionStore } from './store';
import { patchFromSnapshot, patchMatchesRow, snapshotSubscription, type SubscriptionSnapshot } from './subscription';

export type WebhookDeps = {
  store: SubscriptionStore;
  retrieveSubscription: (subscriptionId: string) => Promise<Stripe.Subscription>;
  env?: Record<string, string | undefined>;
  log?: (message: string) => void;
};

export type WebhookOutcome = {
  received: true;
  /** False for event types we ignore and for events that could not be tied to an account. */
  handled: boolean;
  note?: string;
};

const ignored = (note: string): WebhookOutcome => ({ received: true, handled: false, note });

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : (value?.id ?? null);

/**
 * Applies one verified Stripe event to the account's subscriptions row. Every write is the full
 * derived state, so replaying an event is a no-op and out-of-order events for an old
 * subscription do not clobber a newer one.
 */
export const handleStripeEvent = async (event: Stripe.Event, deps: WebhookDeps): Promise<WebhookOutcome> => {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(event.data.object, deps);
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return applySnapshot(snapshotSubscription(event.data.object), {}, deps);
    default:
      return ignored(`Event type ${event.type} is not handled.`);
  }
};

const handleCheckoutCompleted = async (session: Stripe.Checkout.Session, deps: WebhookDeps) => {
  const subscriptionId = idOf(session.subscription);

  if (session.mode !== 'subscription' || !subscriptionId) {
    return ignored(`Checkout session ${session.id} did not create a subscription.`);
  }

  const subscription = await deps.retrieveSubscription(subscriptionId);
  const snapshot = snapshotSubscription(subscription);

  return applySnapshot(
    snapshot,
    {
      accountId: session.client_reference_id ?? session.metadata?.account_id ?? null,
      customerId: idOf(session.customer),
    },
    deps,
  );
};

type Hints = { accountId?: string | null; customerId?: string | null };

const resolveAccountId = async (snapshot: SubscriptionSnapshot, hints: Hints, store: SubscriptionStore) => {
  for (const candidate of [hints.accountId, snapshot.accountId]) {
    if (candidate && UUID_PATTERN.test(candidate)) {
      return candidate;
    }
  }

  const bySubscription = await store.findByStripeSubscription(snapshot.id);

  if (bySubscription) {
    return bySubscription.account_id;
  }

  const customerId = hints.customerId ?? snapshot.customerId;
  const byCustomer = customerId ? await store.findByStripeCustomer(customerId) : null;

  return byCustomer?.account_id ?? null;
};

const applySnapshot = async (snapshot: SubscriptionSnapshot, hints: Hints, deps: WebhookDeps): Promise<WebhookOutcome> => {
  const log = deps.log ?? console.warn;
  const accountId = await resolveAccountId(snapshot, hints, deps.store);

  if (!accountId) {
    log(`Stripe subscription ${snapshot.id} could not be tied to an account; ignoring.`);

    return ignored('No account for this subscription.');
  }

  const row = await deps.store.findByAccount(accountId);

  if (!row) {
    log(`Stripe subscription ${snapshot.id} names account ${accountId}, which does not exist; ignoring.`);

    return ignored('Unknown account.');
  }

  if (row.stripe_subscription_id && row.stripe_subscription_id !== snapshot.id && !hints.accountId) {
    // A lifecycle event for a subscription that is no longer the account's current one, for
    // example the old subscription ending after the account moved to a new one.
    return ignored(`Subscription ${snapshot.id} is not the account's current subscription.`);
  }

  const patch: SubscriptionPatch = {
    ...patchFromSnapshot(snapshot, { env: deps.env, log }),
    ...(hints.customerId ? { stripe_customer_id: hints.customerId } : {}),
  };

  if (patchMatchesRow(patch, row)) {
    return { received: true, handled: true, note: 'Already applied.' };
  }

  await deps.store.save(accountId, patch);

  return { received: true, handled: true };
};
