import type { PlanId } from '@parbot/shared';

export type BillingInterval = 'monthly' | 'yearly';
export type PaidPlanId = Exclude<PlanId, 'hobby'>;
export type BillingProviderName = 'stripe' | 'mock';

export type CheckoutParams = {
  accountId: string;
  email: string;
  planId: PaidPlanId;
  interval: BillingInterval;
  /** Absolute URL of the Billing screen the visitor comes back to. */
  returnUrl: string;
};

export type PortalParams = {
  accountId: string;
  returnUrl: string;
};

export interface BillingProvider {
  name: BillingProviderName;
  createCheckout(params: CheckoutParams): Promise<{ url: string }>;
  createPortal(params: PortalParams): Promise<{ url: string }>;
}

/** An error whose message is safe to show to the visitor. */
export class BillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingError';
  }
}

export const isBillingInterval = (value: unknown): value is BillingInterval =>
  value === 'monthly' || value === 'yearly';

export const isPaidPlanId = (value: unknown): value is PaidPlanId =>
  value === 'starter' || value === 'growth';

/** Appends query parameters to an absolute URL, keeping any it already has. */
export const withParams = (url: string, params: Record<string, string>) => {
  const target = new URL(url);

  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }

  return target.toString();
};
