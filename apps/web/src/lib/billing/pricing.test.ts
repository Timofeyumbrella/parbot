import { describe, expect, it } from 'vitest';

import { PLANS } from '@/lib/plans';

import {
  formatPeriodEnd,
  priceLabel,
  usagePercent,
  yearlyNote,
  yearlySavingCents,
} from './pricing';

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

  it('formats a period end and swallows bad input', () => {
    expect(formatPeriodEnd('2026-10-23T08:00:00.000Z')).toBe('23 October 2026');
    expect(formatPeriodEnd(null)).toBeNull();
    expect(formatPeriodEnd('not a date')).toBeNull();
  });

  it('caps the meter at 100 and treats a zero limit as full', () => {
    expect(usagePercent(40, 200)).toBe(20);
    expect(usagePercent(300, 200)).toBe(100);
    expect(usagePercent(0, 0)).toBe(100);
  });
});
