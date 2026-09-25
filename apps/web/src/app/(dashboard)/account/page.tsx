import { ArrowUpRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAccountPlan } from '@/lib/account';
import { planSummary } from '@/lib/billing/pricing';
import { requireUser } from '@/lib/session';

import { EmailForm, PasswordForm, ProfileForm, SignOutButton } from './account-forms';

export const metadata: Metadata = { title: 'Account' };

export default async function AccountPage() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, account] = await Promise.all([
    supabase.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle(),
    getAccountPlan(),
  ]);

  const fullName =
    profile?.full_name ??
    (typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name : '');
  const email = user.email ?? profile?.email ?? '';
  const pendingEmail = user.new_email ?? null;
  const { plan } = account;

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="Account"
        description="Your name, how you sign in, and the plan this account is on."
      />

      <Card>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
          <CardDescription>{planSummary(account)}</CardDescription>
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
          <CardDescription>
            Ends this session on this device. Your assistants keep running.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
