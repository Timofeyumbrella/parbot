import { z } from 'zod';

import { FULL_NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/components/auth/schema';

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, { error: 'Enter your name.' })
    .max(FULL_NAME_MAX_LENGTH, {
      error: `Keep your name under ${FULL_NAME_MAX_LENGTH} characters.`,
    }),
});

export const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, { error: 'Enter the new email address.' })
    .pipe(z.email({ error: 'Enter a valid email address.' })),
});

export const passwordSchema = z
  .object({
    password: z
      .string()
      .min(1, { error: 'Enter a new password.' })
      .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters.` }),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    error: 'The two passwords differ.',
    path: ['confirmPassword'],
  });

/** The action compares the typed address with the session's own; the schema only carries it. */
export const deleteAccountSchema = z.object({
  confirmEmail: z.string(),
});

export const PROFILE_FIELDS = ['fullName'] as const;
export const EMAIL_FIELDS = ['email'] as const;
export const PASSWORD_FIELDS = ['password', 'confirmPassword'] as const;
export const DELETE_ACCOUNT_FIELDS = ['confirmEmail'] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type EmailField = (typeof EMAIL_FIELDS)[number];
export type PasswordField = (typeof PASSWORD_FIELDS)[number];
export type DeleteAccountField = (typeof DELETE_ACCOUNT_FIELDS)[number];
