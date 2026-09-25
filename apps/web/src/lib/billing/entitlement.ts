// The one rule for which subscription rows grant a paid plan. No server-only imports here.

import type { PlanId } from '@parbot/shared';

import type { Enums } from '@/lib/db';

export type SubscriptionStatus = Enums<'subscription_status'>;

/**
 * Statuses under which the paid plan applies. `past_due` keeps it while Stripe retries the card.
 * `incomplete` means the first payment never went through, so it grants nothing until Stripe
 * reports the subscription active or trialing; `canceled` covers everything that has ended.
 */
const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'trialing',
  'past_due',
]);

export const isEntitled = (status: SubscriptionStatus) => ENTITLED_STATUSES.has(status);

/** The plan a subscriptions row entitles the account to: its plan while live, Hobby otherwise. */
export const entitledPlanId = (
  row: { plan_id: PlanId; status: SubscriptionStatus } | null | undefined,
): PlanId => (row && isEntitled(row.status) ? row.plan_id : 'hobby');
