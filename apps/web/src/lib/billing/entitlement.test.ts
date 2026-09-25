import { describe, expect, it } from 'vitest';

import { entitledPlanId, isEntitled } from './entitlement';

describe('isEntitled', () => {
  it('grants the plan while the subscription is live, including a card Stripe is retrying', () => {
    expect(isEntitled('active')).toBe(true);
    expect(isEntitled('trialing')).toBe(true);
    expect(isEntitled('past_due')).toBe(true);
  });

  it('grants nothing before the first payment succeeds or after the subscription ends', () => {
    expect(isEntitled('incomplete')).toBe(false);
    expect(isEntitled('canceled')).toBe(false);
  });
});

describe('entitledPlanId', () => {
  it('keeps the row plan only while entitled and is Hobby without a row', () => {
    expect(entitledPlanId({ plan_id: 'growth', status: 'active' })).toBe('growth');
    expect(entitledPlanId({ plan_id: 'starter', status: 'past_due' })).toBe('starter');
    expect(entitledPlanId({ plan_id: 'starter', status: 'incomplete' })).toBe('hobby');
    expect(entitledPlanId({ plan_id: 'growth', status: 'canceled' })).toBe('hobby');
    expect(entitledPlanId(null)).toBe('hobby');
    expect(entitledPlanId(undefined)).toBe('hobby');
  });
});
