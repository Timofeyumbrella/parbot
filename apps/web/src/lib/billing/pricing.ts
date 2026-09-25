// Display helpers shared by server and client components. No server-only imports here.

import type { AccountPlan } from '@/lib/account';
import { formatDate } from '@/lib/format';
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
export const yearlySavingCents = (plan: Plan) =>
  Math.max(plan.monthlyCents * 12 - plan.yearlyCents, 0);

/** "Two months free, $58 less than paying monthly". Null for free plans. */
export const yearlyNote = (plan: Plan) =>
  plan.monthlyCents === 0
    ? null
    : `Two months free, ${formatPrice(yearlySavingCents(plan))} less than paying monthly`;

/**
 * "Starter, $29 a month. Renews on Oct 24, 2026." for the Account page. The date reads exactly as
 * the Billing card's, so the two screens never disagree about it. A Hobby row carries no next date,
 * even when an ended or unpaid subscription left a period end behind.
 */
export const planSummary = (account: AccountPlan) => {
  const { plan } = account;
  const price = priceLabel(plan, account.billingInterval ?? 'monthly');
  const lead = `${plan.name}, ${price}.`;

  if (plan.id === 'hobby') {
    return `${lead} Upgrade for more assistants, pages and answers.`;
  }

  if (!account.currentPeriodEnd) {
    return lead;
  }

  const date = formatDate(account.currentPeriodEnd);

  return account.cancelAtPeriodEnd ? `${lead} Ends on ${date}.` : `${lead} Renews on ${date}.`;
};

/** Percentage of a limit that is used, capped at 100, for a meter. */
export const usagePercent = (used: number, limit: number) =>
  limit <= 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));

export const USAGE_WARNING_PERCENT = 80;
