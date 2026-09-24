'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { billingProviderName, createSubscriptionStore, type SubscriptionPatch } from '@/lib/billing';
import { getSession } from '@/lib/session';

export type BillingActionState = { error?: string };

const MOCK_PERIOD_DAYS = 30;

const mockPlanSchema = z.object({
  planId: z.enum(['starter', 'growth']),
  interval: z.enum(['monthly', 'yearly']),
});

/** Writes the signed-in account's row through the service role. Only the account's own row. */
const applyToOwnAccount = async (patch: SubscriptionPatch): Promise<BillingActionState> => {
  if (billingProviderName() !== 'mock') {
    return { error: 'Test-mode plan changes are only available on the mock billing provider. Use the Stripe portal instead.' };
  }

  const { user } = await getSession();

  if (!user) {
    return { error: 'Sign in to change your plan.' };
  }

  try {
    await createSubscriptionStore().save(user.id, patch);
  } catch (error) {
    console.error('Mock plan change failed', error);

    return { error: 'The plan could not be saved. Try again in a moment.' };
  }

  revalidatePath('/billing');

  return {};
};

/** The "Apply <Plan> in test mode" confirm card. */
export const applyMockPlan = async (_state: BillingActionState, formData: FormData): Promise<BillingActionState> => {
  const parsed = mockPlanSchema.safeParse({ planId: formData.get('planId'), interval: formData.get('interval') });

  if (!parsed.success) {
    return { error: 'Pick Starter or Growth, billed monthly or yearly.' };
  }

  const periodEnd = new Date(Date.now() + MOCK_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const result = await applyToOwnAccount({
    plan_id: parsed.data.planId,
    billing_interval: parsed.data.interval,
    status: 'active',
    current_period_end: periodEnd,
    cancel_at_period_end: false,
  });

  if (result.error) {
    return result;
  }

  redirect('/billing?checkout=success');
};

/** The mock portal's "Switch to Hobby". */
export const switchToHobbyMock = async (): Promise<BillingActionState> => {
  const result = await applyToOwnAccount({
    plan_id: 'hobby',
    billing_interval: null,
    status: 'active',
    current_period_end: null,
    cancel_at_period_end: false,
  });

  if (result.error) {
    return result;
  }

  redirect('/billing?checkout=success');
};
