import { type BillingProvider, withParams } from './types';

/**
 * Stands in for Stripe when no key is configured. Checkout and the portal become query
 * parameters on the Billing screen, which renders confirm cards that write the plan directly.
 */
export const createMockProvider = (): BillingProvider => ({
  name: 'mock',
  createCheckout: async ({ planId, interval, returnUrl }) => ({
    url: withParams(returnUrl, { mock_plan: planId, mock_interval: interval }),
  }),
  createPortal: async ({ returnUrl }) => ({
    url: withParams(returnUrl, { mock_portal: '1' }),
  }),
});
