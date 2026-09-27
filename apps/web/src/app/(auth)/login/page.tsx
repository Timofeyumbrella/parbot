import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/auth-form';
import { FormMessage } from '@/components/auth/form-field';
import { safeNextPath } from '@/lib/form';

export const metadata: Metadata = { title: 'Sign in' };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next)) ?? undefined;
  // The account action lands here once the user is gone; the flag is the only trace of it.
  const deleted = first(params.deleted) === '1';

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Your assistant is where you left it."
      footer={
        <>
          New to Parbot?{' '}
          <Link href="/signup" className="text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      {deleted ? (
        <FormMessage tone="success" className="mb-4">
          Your account and everything it owned are deleted.
        </FormMessage>
      ) : null}
      <LoginForm next={next} />
    </AuthCard>
  );
}
