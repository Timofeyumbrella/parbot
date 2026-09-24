import type { Metadata } from 'next';
import Link from 'next/link';

import { CurrentPlanCard } from '@/components/billing/current-plan-card';
import { MockPlanConfirm } from '@/components/billing/mock-plan-confirm';
import { MockPortalCard } from '@/components/billing/mock-portal-card';
import { Notice } from '@/components/billing/notice';
import { PlanPicker } from '@/components/billing/plan-picker';
import { TestModeBanner } from '@/components/billing/test-mode-banner';
import { UsageMeters } from '@/components/billing/usage-meters';
import { PageContainer, PageHeader } from '@/components/page-header';
import { getAccountPlan, getAccountUsage } from '@/lib/account';
import { billingProviderName, isBillingInterval, isPaidPlanId } from '@/lib/billing';
import { isPlanId } from '@/lib/plans';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Billing' };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function BillingPage({ searchParams }: PageProps<'/billing'>) {
  await requireUser();

  const params = await searchParams;
  const [account, usage] = await Promise.all([getAccountPlan(), getAccountUsage()]);
  const providerName = billingProviderName();
  const isMock = providerName === 'mock';

  const checkout = first(params.checkout);
  const mockPlan = first(params.mock_plan);
  const mockInterval = first(params.mock_interval);
  const showMockPlan = isMock && isPaidPlanId(mockPlan) ? mockPlan : null;
  const showMockPortal = isMock && first(params.mock_portal) === '1';
  const preselectPlan = first(params.plan);
  const preselectInterval = first(params.interval);
  const preselect = isPlanId(preselectPlan)
    ? {
        planId: preselectPlan,
        interval: isBillingInterval(preselectInterval) ? preselectInterval : null,
      }
    : null;

  return (
    <PageContainer>
      <PageHeader
        title="Billing"
        description="Your plan, what you have used of it, and the plans you can move to."
      />

      {isMock ? <TestModeBanner /> : null}

      {checkout === 'success' ? (
        <Notice tone="success" title="Your plan is updated.">
          {isMock ? (
            <span>The change is applied to your account right away in test mode.</span>
          ) : (
            <span>
              It can take a few seconds for the webhook to land.{' '}
              <Link href="/billing" className="text-foreground underline underline-offset-4">
                Refresh
              </Link>{' '}
              if the plan below has not changed yet.
            </span>
          )}
        </Notice>
      ) : null}

      {checkout === 'cancelled' ? (
        <Notice tone="info" title="Checkout was cancelled.">
          Your plan has not changed. Choose a plan below whenever you are ready.
        </Notice>
      ) : null}

      {showMockPlan ? (
        <MockPlanConfirm
          planId={showMockPlan}
          interval={isBillingInterval(mockInterval) ? mockInterval : 'monthly'}
        />
      ) : null}

      {showMockPortal ? (
        <MockPortalCard currentPlanName={account.plan.name} isHobby={account.plan.id === 'hobby'} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <CurrentPlanCard account={account} providerName={providerName} className="lg:col-span-2" />
        <UsageMeters usage={usage} plan={account.plan} className="lg:col-span-3" />
      </div>

      <PlanPicker
        currentPlanId={account.plan.id}
        currentInterval={account.billingInterval}
        currentStatus={account.status}
        hasStripeCustomer={account.hasStripeCustomer}
        providerName={providerName}
        preselect={preselect}
      />
    </PageContainer>
  );
}
