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
  const find = (predicate: (row: Subscription) => boolean) => [...rows.values()].find(predicate) ?? null;

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
