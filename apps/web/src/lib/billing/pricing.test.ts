import { describe, expect, it } from 'vitest';

import type { AccountPlan } from '@/lib/account';
import { formatDate } from '@/lib/format';
import { PLANS } from '@/lib/plans';

import { planSummary, priceLabel, usagePercent, yearlyNote, yearlySavingCents } from './pricing';

const account = (overrides: Partial<AccountPlan> = {}): AccountPlan => ({
  plan: PLANS.hobby,
  status: 'active',
  billingInterval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasStripeCustomer: false,
  ...overrides,
});

const PERIOD_END = '2026-10-24T08:00:00.000Z';

describe('pricing labels', () => {
  it('prices each interval and calls the free plan free', () => {
    expect(priceLabel(PLANS.hobby, 'monthly')).toBe('Free');
    expect(priceLabel(PLANS.starter, 'monthly')).toBe('$29 a month');
    expect(priceLabel(PLANS.starter, 'yearly')).toBe('$290 a year');
    expect(priceLabel(PLANS.growth, 'yearly')).toBe('$990 a year');
  });

  it('states the two months a year saves', () => {
    expect(yearlySavingCents(PLANS.starter)).toBe(5800);
    expect(yearlyNote(PLANS.growth)).toBe('Two months free, $198 less than paying monthly');
    expect(yearlyNote(PLANS.hobby)).toBeNull();
  });

  it('summarises the plan with the date in the shape every other screen uses', () => {
    const starter = account({
      plan: PLANS.starter,
      billingInterval: 'monthly',
      currentPeriodEnd: PERIOD_END,
      hasStripeCustomer: true,
    });

    expect(planSummary(starter)).toBe(`Starter, $29 a month. Renews on ${formatDate(PERIOD_END)}.`);
    expect(planSummary(starter)).toMatch(/Renews on [A-Z][a-z]{2} \d{1,2}, \d{4}\.$/);
    expect(planSummary({ ...starter, cancelAtPeriodEnd: true })).toBe(
      `Starter, $29 a month. Ends on ${formatDate(PERIOD_END)}.`,
    );
    expect(planSummary({ ...starter, billingInterval: 'yearly', currentPeriodEnd: null })).toBe(
      'Starter, $290 a year.',
    );
  });

  it('never shows a next date on Hobby, even after a subscription ended or went unpaid', () => {
    expect(planSummary(account())).toBe(
      'Hobby, Free. Upgrade for more assistants, pages and answers.',
    );
    expect(planSummary(account({ status: 'canceled', currentPeriodEnd: PERIOD_END }))).toBe(
      'Hobby, Free. Upgrade for more assistants, pages and answers.',
    );
    expect(planSummary(account({ status: 'incomplete', currentPeriodEnd: PERIOD_END }))).toBe(
      'Hobby, Free. Upgrade for more assistants, pages and answers.',
    );
  });

  it('caps the meter at 100 and treats a zero limit as full', () => {
    expect(usagePercent(40, 200)).toBe(20);
    expect(usagePercent(300, 200)).toBe(100);
    expect(usagePercent(0, 0)).toBe(100);
  });
});
