import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard } from '@/components/auth/auth-card';
import { SignupForm } from '@/components/auth/auth-form';
import { isBillingInterval } from '@/components/auth/schema';
import { isPlanId, PLANS } from '@/lib/plans';

export const metadata: Metadata = { title: 'Create account' };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const params = await searchParams;
  const planParam = first(params.plan);
  const intervalParam = first(params.interval);
  const plan = isPlanId(planParam) ? PLANS[planParam] : null;
  const interval = plan && isBillingInterval(intervalParam) ? intervalParam : undefined;
  const description =
    plan && plan.id !== 'hobby'
      ? `Start on ${plan.name}${interval ? `, billed ${interval}` : ''}. You set up billing after your first assistant exists.`
      : 'Free to start. No card needed.';

  return (
    <AuthCard
      title="Create your account"
      description={description}
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm plan={plan?.id} interval={interval} />
    </AuthCard>
  );
}
