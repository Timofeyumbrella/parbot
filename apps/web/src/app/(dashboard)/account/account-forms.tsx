'use client';

import { Loader2, LogOut } from 'lucide-react';
import { useActionState, useEffect, useTransition } from 'react';
import { toast } from 'sonner';

import { updateEmail, updatePassword, updateProfile } from '@/actions/account';
import { signOut } from '@/actions/auth';
import { FormField, FormMessage } from '@/components/auth/form-field';
import { PASSWORD_MIN_LENGTH } from '@/components/auth/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { type FormState, idleState } from '@/lib/form';

import type { EmailField, PasswordField, ProfileField } from './schema';

const useSuccessToast = (state: FormState) => {
  useEffect(() => {
    if (state.status === 'success' && state.message) {
      toast.success(state.message);
    }
  }, [state]);
};

const SaveButton = ({ pending, children }: { pending: boolean; children: React.ReactNode }) => (
  <Button type="submit" disabled={pending}>
    {pending ? <Loader2 className="animate-spin" /> : null}
    {children}
  </Button>
);

const FormError = ({ state }: { state: FormState }) =>
  state.status === 'error' && state.error && !state.fieldErrors ? (
    <FormMessage tone="error">{state.error}</FormMessage>
  ) : null;

export const ProfileForm = ({ fullName }: { fullName: string }) => {
  const [state, action, pending] = useActionState(updateProfile, idleState as FormState<ProfileField>);

  useSuccessToast(state);

  return (
    <form action={action} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Name</CardTitle>
          <CardDescription>Only you see it. It is not shown to visitors of your assistants.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormError state={state} />
          <FormField label="Full name" error={state.fieldErrors?.fullName}>
            {(control) => (
              <Input {...control} name="fullName" autoComplete="name" defaultValue={state.values?.fullName ?? fullName} />
            )}
          </FormField>
        </CardContent>
        <CardFooter className="justify-end">
          <SaveButton pending={pending}>Save name</SaveButton>
        </CardFooter>
      </Card>
    </form>
  );
};

export const EmailForm = ({ email, pendingEmail }: { email: string; pendingEmail: string | null }) => {
  const [state, action, pending] = useActionState(updateEmail, idleState as FormState<EmailField>);

  useSuccessToast(state);

  return (
    <form action={action} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            You sign in with it. Changing it sends a confirmation link to both the old and the new address.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormError state={state} />
          {state.status === 'success' && state.message ? <FormMessage tone="success">{state.message}</FormMessage> : null}
          {pendingEmail && state.status !== 'success' ? (
            <FormMessage tone="success">
              A change to {pendingEmail} is waiting for confirmation. Open the links we sent to both addresses.
            </FormMessage>
          ) : null}
          <FormField label="Email address" error={state.fieldErrors?.email}>
            {(control) => (
              <Input
                {...control}
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={state.values?.email ?? email}
              />
            )}
          </FormField>
        </CardContent>
        <CardFooter className="justify-end">
          <SaveButton pending={pending}>Change email</SaveButton>
        </CardFooter>
      </Card>
    </form>
  );
};

export const PasswordForm = () => {
  const [state, action, pending] = useActionState(updatePassword, idleState as FormState<PasswordField>);

  useSuccessToast(state);

  return (
    <form action={action} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>At least {PASSWORD_MIN_LENGTH} characters. Other sessions stay signed in.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormError state={state} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="New password" error={state.fieldErrors?.password}>
              {(control) => <Input {...control} name="password" type="password" autoComplete="new-password" />}
            </FormField>
            <FormField label="Repeat new password" error={state.fieldErrors?.confirmPassword}>
              {(control) => <Input {...control} name="confirmPassword" type="password" autoComplete="new-password" />}
            </FormField>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <SaveButton pending={pending}>Change password</SaveButton>
        </CardFooter>
      </Card>
    </form>
  );
};

export const SignOutButton = () => {
  const [pending, startTransition] = useTransition();

  return (
    <Button variant="outline" disabled={pending} onClick={() => startTransition(() => signOut())}>
      {pending ? <Loader2 className="animate-spin" /> : <LogOut data-icon="inline-start" />}
      Sign out
    </Button>
  );
};
