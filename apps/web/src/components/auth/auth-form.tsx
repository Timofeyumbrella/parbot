'use client';

import { Loader2 } from 'lucide-react';
import { useActionState } from 'react';

import { type SignInField, signIn, type SignUpField, signUp } from '@/actions/auth';
import { FormField, FormMessage } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type FormState, idleState } from '@/lib/form';

import { PASSWORD_MIN_LENGTH } from './schema';

const SubmitButton = ({ pending, children }: { pending: boolean; children: React.ReactNode }) => (
  <Button type="submit" className="w-full" disabled={pending}>
    {pending ? <Loader2 className="animate-spin" /> : null}
    {children}
  </Button>
);

export const LoginForm = ({ next }: { next?: string }) => {
  const [state, action, pending] = useActionState(signIn, idleState as FormState<SignInField>);

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.status === 'error' && state.error && !state.fieldErrors ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : null}
      <FormField label="Email" error={state.fieldErrors?.email}>
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            defaultValue={state.values?.email ?? ''}
            placeholder="you@company.com"
          />
        )}
      </FormField>
      <FormField label="Password" error={state.fieldErrors?.password}>
        {(control) => <Input {...control} name="password" type="password" autoComplete="current-password" />}
      </FormField>
      <SubmitButton pending={pending}>Sign in</SubmitButton>
    </form>
  );
};

export const SignupForm = ({ plan, interval }: { plan?: string; interval?: string }) => {
  const [state, action, pending] = useActionState(signUp, idleState as FormState<SignUpField>);

  if (state.status === 'success') {
    return <FormMessage tone="success">{state.message}</FormMessage>;
  }

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {plan ? <input type="hidden" name="plan" value={plan} /> : null}
      {interval ? <input type="hidden" name="interval" value={interval} /> : null}
      {state.status === 'error' && state.error && !state.fieldErrors ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : null}
      <FormField label="Full name" error={state.fieldErrors?.fullName}>
        {(control) => (
          <Input
            {...control}
            name="fullName"
            autoComplete="name"
            autoFocus
            defaultValue={state.values?.fullName ?? ''}
            placeholder="Ada Lovelace"
          />
        )}
      </FormField>
      <FormField label="Email" error={state.fieldErrors?.email}>
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.values?.email ?? ''}
            placeholder="you@company.com"
          />
        )}
      </FormField>
      <FormField
        label="Password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={state.fieldErrors?.password}
      >
        {(control) => <Input {...control} name="password" type="password" autoComplete="new-password" />}
      </FormField>
      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
};
