'use server';

import { revalidatePath } from 'next/cache';

import {
  EMAIL_FIELDS,
  type EmailField,
  emailSchema,
  PASSWORD_FIELDS,
  type PasswordField,
  passwordSchema,
  PROFILE_FIELDS,
  type ProfileField,
  profileSchema,
} from '@/app/(dashboard)/account/schema';
import { authErrorMessage } from '@/components/auth/auth-errors';
import { type FormState, formValues, parseForm } from '@/lib/form';
import { requireUser } from '@/lib/session';

export const updateProfile = async (
  _previous: FormState<ProfileField>,
  formData: FormData,
): Promise<FormState<ProfileField>> => {
  const values = formValues(formData, PROFILE_FIELDS);
  const parsed = parseForm(profileSchema, values);

  if (!parsed.ok) {
    return parsed.state;
  }

  const { supabase, user } = await requireUser();
  const fullName = parsed.data.fullName;

  // The trigger only copies metadata on sign up, so both places are written here.
  const { error: authError } = await supabase.auth.updateUser({ data: { full_name: fullName } });

  if (authError) {
    return { status: 'error', values, error: authErrorMessage(authError) };
  }

  const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id);

  if (error) {
    return { status: 'error', values, error: 'Your name could not be saved. Try again.' };
  }

  revalidatePath('/account');

  return { status: 'success', message: 'Name saved.', values: { fullName } };
};

export const updateEmail = async (
  _previous: FormState<EmailField>,
  formData: FormData,
): Promise<FormState<EmailField>> => {
  const values = formValues(formData, EMAIL_FIELDS);
  const parsed = parseForm(emailSchema, values);

  if (!parsed.ok) {
    return parsed.state;
  }

  const { supabase, user } = await requireUser();
  const email = parsed.data.email;

  if (email === user.email?.toLowerCase()) {
    return { status: 'error', values, fieldErrors: { email: 'That is already your email address.' } };
  }

  const { data, error } = await supabase.auth.updateUser({ email });

  if (error) {
    return { status: 'error', values, error: authErrorMessage(error) };
  }

  // Auth only applies the change at once when confirmations are off; otherwise it waits for
  // the links it just sent and profiles.email follows when the visitor next signs in.
  const applied = data.user?.email?.toLowerCase() === email;

  if (applied) {
    await supabase.from('profiles').update({ email }).eq('id', user.id);
  }

  revalidatePath('/account');

  return {
    status: 'success',
    message: applied
      ? 'Email updated.'
      : `Confirmation links went to ${user.email ?? 'your current address'} and ${email}. The change applies once you open both.`,
    values: { email },
  };
};

export const updatePassword = async (
  _previous: FormState<PasswordField>,
  formData: FormData,
): Promise<FormState<PasswordField>> => {
  const values = formValues(formData, PASSWORD_FIELDS);
  const parsed = parseForm(passwordSchema, values, PASSWORD_FIELDS);

  if (!parsed.ok) {
    return parsed.state;
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { status: 'error', error: authErrorMessage(error) };
  }

  return { status: 'success', message: 'Password changed.' };
};
