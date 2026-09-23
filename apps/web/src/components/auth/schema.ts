import { z } from 'zod';

import { isPlanId } from '@/lib/plans';

export const PASSWORD_MIN_LENGTH = 8;
export const FULL_NAME_MAX_LENGTH = 80;

export type BillingInterval = 'monthly' | 'yearly';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { error: 'Enter your email address.' })
  .pipe(z.email({ error: 'Enter a valid email address.' }));

const password = z
  .string()
  .min(1, { error: 'Enter your password.' })
  .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters.` });

export const signInSchema = z.object({
  email,
  // Sign in never judges the password: a short one is simply wrong, and saying so leaks nothing.
  password: z.string().min(1, { error: 'Enter your password.' }),
  next: z.string().optional(),
});

export const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, { error: 'Enter your name.' })
    .max(FULL_NAME_MAX_LENGTH, { error: `Keep your name under ${FULL_NAME_MAX_LENGTH} characters.` }),
  email,
  password,
  plan: z.string().optional(),
  interval: z.string().optional(),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

export const isBillingInterval = (value: unknown): value is BillingInterval =>
  value === 'monthly' || value === 'yearly';

/** Where a new account goes first. Only a real plan and interval survive the trip. */
export const onboardingPath = (plan?: string | null, interval?: string | null) => {
  const params = new URLSearchParams();

  if (isPlanId(plan)) {
    params.set('plan', plan);

    if (isBillingInterval(interval)) {
      params.set('interval', interval);
    }
  }

  const query = params.toString();

  return query ? `/onboarding?${query}` : '/onboarding';
};

/** The same pair, kept for the sign-up form so a refresh or an error does not lose them. */
export const signupPath = (plan?: string | null, interval?: string | null) => {
  const query = onboardingPath(plan, interval).split('?')[1];

  return query ? `/signup?${query}` : '/signup';
};
