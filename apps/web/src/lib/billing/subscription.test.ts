import { describe, expect, it, vi } from 'vitest';

import { mapSubscriptionStatus, patchFromSnapshot, patchMatchesRow, snapshotSubscription } from './subscription';
import { PERIOD_END, subscriptionFixture } from './testing';

const env = { STRIPE_PRICE_STARTER_MONTHLY: 'price_sm', STRIPE_PRICE_GROWTH_YEARLY: 'price_gy' };

describe('snapshotSubscription', () => {
  it('reads the customer, price, period end and account id', () => {
    expect(snapshotSubscription(subscriptionFixture())).toEqual({
      id: 'sub_1',
      customerId: 'cus_1',
      status: 'active',
      priceId: 'price_sm',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: PERIOD_END,
      accountId: '00000000-0000-4000-8000-000000000001',
    });
  });

  it('accepts an expanded customer and a missing item', () => {
    const snapshot = snapshotSubscription(
      subscriptionFixture({ customer: { id: 'cus_2', object: 'customer' }, items: { object: 'list', data: [] }, metadata: {} }),
    );

    expect(snapshot.customerId).toBe('cus_2');
    expect(snapshot.priceId).toBeNull();
    expect(snapshot.currentPeriodEnd).toBeNull();
    expect(snapshot.accountId).toBeNull();
  });
});

describe('mapSubscriptionStatus', () => {
  it('keeps the statuses our enum has and ends everything else', () => {
    expect(mapSubscriptionStatus('active')).toBe('active');
    expect(mapSubscriptionStatus('trialing')).toBe('trialing');
    expect(mapSubscriptionStatus('past_due')).toBe('past_due');
    expect(mapSubscriptionStatus('incomplete')).toBe('incomplete');
    expect(mapSubscriptionStatus('canceled')).toBe('canceled');
    expect(mapSubscriptionStatus('unpaid')).toBe('canceled');
    expect(mapSubscriptionStatus('incomplete_expired')).toBe('canceled');
    expect(mapSubscriptionStatus('paused')).toBe('canceled');
  });
});

describe('patchFromSnapshot', () => {
  it('keeps the plan while the subscription is active', () => {
    expect(patchFromSnapshot(snapshotSubscription(subscriptionFixture()), { env })).toEqual({
      plan_id: 'starter',
      status: 'active',
      billing_interval: 'monthly',
      stripe_subscription_id: 'sub_1',
      stripe_customer_id: 'cus_1',
      current_period_end: new Date(PERIOD_END * 1000).toISOString(),
      cancel_at_period_end: false,
    });
  });

  it('keeps the plan and marks it past due', () => {
    const patch = patchFromSnapshot(snapshotSubscription(subscriptionFixture({ status: 'past_due' })), { env });

    expect(patch).toMatchObject({ plan_id: 'starter', status: 'past_due' });
  });

  it('copies cancel_at_period_end while the plan runs out', () => {
    const patch = patchFromSnapshot(snapshotSubscription(subscriptionFixture({ cancel_at_period_end: true })), { env });

    expect(patch).toMatchObject({ plan_id: 'starter', status: 'active', cancel_at_period_end: true });
  });

  it('drops to Hobby when the subscription ends', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete_expired']) {
      const patch = patchFromSnapshot(snapshotSubscription(subscriptionFixture({ status })), { env });

      expect(patch).toMatchObject({ plan_id: 'hobby', status: 'canceled', billing_interval: null, stripe_subscription_id: 'sub_1' });
    }
  });

  it('falls back to Hobby and logs when the price is unknown', () => {
    const log = vi.fn();
    const fixture = subscriptionFixture({
      items: { object: 'list', data: [{ id: 'si', object: 'subscription_item', price: { id: 'price_zz' }, current_period_end: PERIOD_END }] },
    });
    const patch = patchFromSnapshot(snapshotSubscription(fixture), { env, log });

    expect(patch).toMatchObject({ plan_id: 'hobby', status: 'active', billing_interval: null });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('price_zz'));
  });
});

describe('patchMatchesRow', () => {
  it('treats equal timestamps in different formats as the same', () => {
    const patch = patchFromSnapshot(snapshotSubscription(subscriptionFixture()), { env });
    const row = { ...patch, current_period_end: '2027-01-15T08:00:00+00:00' };

    expect(patchMatchesRow(patch, row)).toBe(true);
    expect(patchMatchesRow(patch, { ...row, status: 'past_due' })).toBe(false);
  });
});
