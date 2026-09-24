import { ArrowUpRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAccountPlan } from '@/lib/account';
import { formatPrice } from '@/lib/plans';
import { requireUser } from '@/lib/session';

import { EmailForm, PasswordForm, ProfileForm, SignOutButton } from './account-forms';

export const metadata: Metadata = { title: 'Account' };

const periodEnd = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(iso)) : null;

export default async function AccountPage() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, account] = await Promise.all([
    supabase.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle(),
    getAccountPlan(),
  ]);

  const fullName = profile?.full_name ?? (typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name : '');
  const email = user.email ?? profile?.email ?? '';
  const pendingEmail = user.new_email ?? null;
  const { plan } = account;
  const price =
    plan.monthlyCents === 0
      ? 'Free'
      : account.billingInterval === 'yearly'
        ? `${formatPrice(plan.yearlyCents)} a year`
        : `${formatPrice(plan.monthlyCents)} a month`;
  const renewal = periodEnd(account.currentPeriodEnd);

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Account" description="Your name, how you sign in, and the plan this account is on." />

      <Card>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
          <CardDescription>
            {plan.name}, {price}.
            {renewal
              ? account.cancelAtPeriodEnd
                ? ` Ends ${renewal}.`
                : ` Renews ${renewal}.`
              : plan.id === 'hobby'
                ? ' Upgrade for more assistants, pages and answers.'
                : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/billing">
              {plan.id === 'hobby' ? 'See plans' : 'Manage billing'}
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <ProfileForm fullName={fullName} />
      <EmailForm email={email} pendingEmail={pendingEmail} />
      <PasswordForm />

      <Card>
        <CardHeader>
          <CardTitle>Sign out</CardTitle>
          <CardDescription>Ends this session on this device. Your assistants keep running.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
