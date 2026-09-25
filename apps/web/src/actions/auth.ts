'use server';

import { redirect } from 'next/navigation';

import { authErrorMessage } from '@/components/auth/auth-errors';
import { onboardingPath, signInSchema, signUpSchema } from '@/components/auth/schema';
import { type FormState, formValues, parseForm, publicValues, safeNextPath } from '@/lib/form';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type { FormState } from '@/lib/form';

const SIGN_IN_FIELDS = ['email', 'password', 'next'] as const;
const SIGN_UP_FIELDS = ['fullName', 'email', 'password', 'plan', 'interval'] as const;

export type SignInField = (typeof SIGN_IN_FIELDS)[number];
export type SignUpField = (typeof SIGN_UP_FIELDS)[number];

export const signIn = async (
  _previous: FormState<SignInField>,
  formData: FormData,
): Promise<FormState<SignInField>> => {
  const values = formValues(formData, SIGN_IN_FIELDS);
  const parsed = parseForm(signInSchema, values, ['password']);

  if (!parsed.ok) {
    return parsed.state;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      status: 'error',
      error: authErrorMessage(error),
      values: publicValues(values, ['password']),
    };
  }

  redirect(safeNextPath(parsed.data.next) ?? '/dashboard');
};

export const signUp = async (
  _previous: FormState<SignUpField>,
  formData: FormData,
): Promise<FormState<SignUpField>> => {
  const values = formValues(formData, SIGN_UP_FIELDS);
  const parsed = parseForm(signUpSchema, values, ['password']);

  if (!parsed.ok) {
    return parsed.state;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (error) {
    return {
      status: 'error',
      error: authErrorMessage(error),
      values: publicValues(values, ['password']),
    };
  }

  // With confirmations on (production) there is no session yet; the account exists but the
  // visitor has to come back through the link before they can sign in.
  if (!data.session) {
    return {
      status: 'success',
      message: `We sent a confirmation link to ${parsed.data.email}. Open it, then sign in.`,
      values: publicValues(values, ['password']),
    };
  }

  redirect(onboardingPath(parsed.data.plan, parsed.data.interval));
};

export const signOut = async () => {
  const supabase = await createSupabaseServerClient();

  await supabase.auth.signOut();

  redirect('/login');
};
