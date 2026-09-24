import type Stripe from 'stripe';

import type { Subscription } from '@/lib/db';

import type { SubscriptionPatch, SubscriptionStore } from './store';

/** An in-memory SubscriptionStore for tests, with a count of writes to prove idempotency. */
export const createMemoryStore = (accountIds: string[]) => {
  const rows = new Map<string, Subscription>();

  for (const accountId of accountIds) {
    rows.set(accountId, {
      account_id: accountId,
      plan_id: 'hobby',
      status: 'active',
      billing_interval: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      current_period_end: null,
      cancel_at_period_end: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
  }

  const saves: Array<{ accountId: string; patch: SubscriptionPatch }> = [];
  const find = (predicate: (row: Subscription) => boolean) =>
    [...rows.values()].find(predicate) ?? null;

  const store: SubscriptionStore = {
    findByAccount: async (accountId) => rows.get(accountId) ?? null,
    findByStripeSubscription: async (id) => find((row) => row.stripe_subscription_id === id),
    findByStripeCustomer: async (id) => find((row) => row.stripe_customer_id === id),
    save: async (accountId, patch) => {
      const current = rows.get(accountId);

      if (!current) {
        throw new Error(`No subscriptions row for ${accountId}`);
      }

      const next = { ...current, ...patch, updated_at: new Date().toISOString() } as Subscription;
      rows.set(accountId, next);
      saves.push({ accountId, patch });

      return next;
    },
  };

  return { store, rows, saves };
};

export const PERIOD_END = 1_800_000_000;

/** A Stripe subscription as the current API version shapes it: the period end sits on the item. */
export const subscriptionFixture = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'sub_1',
    object: 'subscription',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { account_id: '00000000-0000-4000-8000-000000000001' },
    items: {
      object: 'list',
      data: [
        {
          id: 'si_1',
          object: 'subscription_item',
          price: { id: 'price_sm', object: 'price' },
          current_period_end: PERIOD_END,
        },
      ],
    },
    ...overrides,
  }) as unknown as Stripe.Subscription;
