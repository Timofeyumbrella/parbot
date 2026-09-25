'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  DELETE_ACCOUNT_FIELDS,
  type DeleteAccountField,
  deleteAccountSchema,
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
import { getAccountPlan } from '@/lib/account';
import { type FormState, formValues, parseForm } from '@/lib/form';
import { requireUser } from '@/lib/session';
import { removeStoredFiles } from '@/lib/source-files';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

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

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName })
    .eq('id', user.id);

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
    return {
      status: 'error',
      values,
      fieldErrors: { email: 'That is already your email address.' },
    };
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

/**
 * Deletes the signed-in account for good. The auth user's cascade removes the profile, the
 * subscription row and every assistant with its rows, but not the bucket, so the account's whole
 * folder of uploads goes first. A paid plan that is still running is refused: the subscription
 * would outlive the account it bills.
 */
export const deleteAccount = async (
  _previous: FormState<DeleteAccountField>,
  formData: FormData,
): Promise<FormState<DeleteAccountField>> => {
  const values = formValues(formData, DELETE_ACCOUNT_FIELDS);
  const parsed = parseForm(deleteAccountSchema, values);

  if (!parsed.ok) {
    return parsed.state;
  }

  const { supabase, user } = await requireUser();
  const email = user.email ?? '';

  if (!email || parsed.data.confirmEmail.trim().toLowerCase() !== email.toLowerCase()) {
    return {
      status: 'error',
      values,
      error: 'The email address did not match.',
      fieldErrors: { confirmEmail: `Type ${email || 'your email address'} exactly as shown.` },
    };
  }

  const account = await getAccountPlan();

  if (account.plan.id !== 'hobby' && !account.cancelAtPeriodEnd) {
    return {
      status: 'error',
      values,
      error: `Your ${account.plan.name} plan is still running. Cancel it on the billing page first, then delete the account.`,
    };
  }

  const service = createSupabaseServiceClient();

  try {
    await removeStoredFiles(service, user.id);
  } catch (cause) {
    console.error('[account] stored files were not removed', { userId: user.id, cause });

    return {
      status: 'error',
      values,
      error: 'Your uploaded files could not be removed. Try again in a moment.',
    };
  }

  const { error } = await service.auth.admin.deleteUser(user.id);

  if (error) {
    console.error('[account] auth user was not deleted', { userId: user.id, error });

    return {
      status: 'error',
      values,
      error: 'The account could not be deleted. Try again in a moment.',
    };
  }

  // The user is gone, so only the cookies on this device are left to clear.
  await supabase.auth.signOut({ scope: 'local' });

  redirect('/login?deleted=1');
};
