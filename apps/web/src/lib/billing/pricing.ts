// Display helpers shared by server and client components. No server-only imports here.

import { formatPrice, type Plan } from '@/lib/plans';

import type { BillingInterval } from './types';

/** "$29 a month", "$290 a year" or "Free". */
export const priceLabel = (plan: Plan, interval: BillingInterval) => {
  if (plan.monthlyCents === 0) {
    return 'Free';
  }

  return interval === 'yearly'
    ? `${formatPrice(plan.yearlyCents)} a year`
    : `${formatPrice(plan.monthlyCents)} a month`;
};

/** What a year on the plan costs less than twelve months would. Zero for free plans. */
export const yearlySavingCents = (plan: Plan) => Math.max(plan.monthlyCents * 12 - plan.yearlyCents, 0);

/** "$290 a year, two months free". */
export const yearlyNote = (plan: Plan) =>
  plan.monthlyCents === 0 ? null : `Two months free against ${formatPrice(plan.monthlyCents)} a month`;

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** "23 October 2026", or null when the value is missing or not a date. */
export const formatPeriodEnd = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date);
};

/** Percentage of a limit that is used, capped at 100, for a meter. */
export const usagePercent = (used: number, limit: number) =>
  limit <= 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));

export const USAGE_WARNING_PERCENT = 80;
