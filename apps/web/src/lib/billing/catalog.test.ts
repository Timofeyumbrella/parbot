import { describe, expect, it } from 'vitest';

import { lookupKeyFor, planForPriceId, priceCatalog, priceIdFor } from './catalog';

const env = {
  STRIPE_PRICE_STARTER_MONTHLY: 'price_sm',
  STRIPE_PRICE_STARTER_YEARLY: 'price_sy',
  STRIPE_PRICE_GROWTH_MONTHLY: 'price_gm',
  STRIPE_PRICE_GROWTH_YEARLY: ' price_gy ',
};

describe('price catalog', () => {
  it('maps every paid plan and interval to its price id', () => {
    expect(priceIdFor('starter', 'monthly', env)).toBe('price_sm');
    expect(priceIdFor('starter', 'yearly', env)).toBe('price_sy');
    expect(priceIdFor('growth', 'monthly', env)).toBe('price_gm');
    expect(priceIdFor('growth', 'yearly', env)).toBe('price_gy');
  });

  it('maps a price id back to its plan and interval', () => {
    expect(planForPriceId('price_gy', env)).toEqual({ planId: 'growth', interval: 'yearly' });
    expect(planForPriceId('price_sm', env)).toEqual({ planId: 'starter', interval: 'monthly' });
  });

  it('returns null for a price that is not in the catalog', () => {
    expect(planForPriceId('price_unknown', env)).toBeNull();
    expect(planForPriceId(null, env)).toBeNull();
    expect(planForPriceId(undefined, env)).toBeNull();
  });

  it('refuses Hobby, which has no price', () => {
    expect(() => priceIdFor('hobby', 'monthly', env)).toThrow(/Hobby/);
  });

  it('names the missing variable when a price is not configured', () => {
    expect(() => priceIdFor('growth', 'yearly', { ...env, STRIPE_PRICE_GROWTH_YEARLY: '' })).toThrow(
      /STRIPE_PRICE_GROWTH_YEARLY/,
    );
  });

  it('lists only the configured entries', () => {
    expect(priceCatalog({ STRIPE_PRICE_STARTER_MONTHLY: 'price_sm' })).toEqual([
      { planId: 'starter', interval: 'monthly', priceId: 'price_sm' },
    ]);
  });

  it('uses stable lookup keys the seed script and webhook agree on', () => {
    expect(lookupKeyFor('starter', 'monthly')).toBe('starter_monthly');
    expect(lookupKeyFor('growth', 'yearly')).toBe('growth_yearly');
  });
});
