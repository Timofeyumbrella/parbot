import type { Metadata } from 'next';
import Link from 'next/link';

import { isBillingInterval } from '@/components/auth/schema';
import { CreateAssistantForm } from '@/components/assistants/create-assistant-form';
import { LimitReached } from '@/components/assistants/limit-reached';
import { PageContainer, PageHeader } from '@/components/page-header';
import { getAccountPlan, getAccountUsage } from '@/lib/account';
import { checkCapacity, isPlanId, PLANS } from '@/lib/plans';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'New assistant' };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * A three-field form reads better narrow, but the container keeps the shared width so the title
 * sits where it does on every other screen; the column stays left-aligned under it.
 */
const FORM_COLUMN = 'flex max-w-2xl flex-col gap-6';

export default async function OnboardingPage({ searchParams }: PageProps<'/onboarding'>) {
  await requireUser();

  const [params, account, usage] = await Promise.all([
    searchParams,
    getAccountPlan(),
    getAccountUsage(),
  ]);
  const capacity = checkCapacity(account.plan.id, usage.assistants, 'assistants');
  const isFirst = usage.assistants === 0;

  // A plan chosen on the pricing page rides along until billing picks it up.
  const chosenPlan = first(params.plan);
  const chosenInterval = first(params.interval);
  const pendingPlan =
    isPlanId(chosenPlan) && chosenPlan !== 'hobby' && chosenPlan !== account.plan.id
      ? PLANS[chosenPlan]
      : null;
  const billingHref = pendingPlan
    ? `/billing?plan=${pendingPlan.id}${isBillingInterval(chosenInterval) ? `&interval=${chosenInterval}` : ''}`
    : '/billing';

  if (!capacity.allowed) {
    return (
      <PageContainer>
        <PageHeader
          title="New assistant"
          description="Every assistant answers from its own documentation."
        />
        <div className={FORM_COLUMN}>
          <LimitReached plan={account.plan} capacity={capacity} />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={isFirst ? 'Create your first assistant' : 'New assistant'}
        description={
          isFirst
            ? 'Name it after the product it will answer for. Next you will point it at your docs.'
            : 'Each assistant has its own docs, inbox and widget. Next you will point this one at its docs.'
        }
      />
      <div className={FORM_COLUMN}>
        {pendingPlan ? (
          <p className="bg-accent text-accent-foreground rounded-lg px-3 py-2 text-sm">
            You picked the {pendingPlan.name} plan. Create the assistant first, then finish on the{' '}
            <Link href={billingHref} className="font-medium underline underline-offset-4">
              billing page
            </Link>
            .
          </p>
        ) : null}
        <div className="bg-card ring-foreground/10 rounded-xl p-4 ring-1 sm:p-6">
          <CreateAssistantForm />
        </div>
      </div>
    </PageContainer>
  );
}
