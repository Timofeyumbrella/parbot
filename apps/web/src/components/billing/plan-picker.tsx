'use client';

import type { PlanId } from '@parbot/shared';
import { cn } from 'cn';
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AccountPlan } from '@/lib/account';
import { priceLabel, yearlyNote } from '@/lib/billing/pricing';
import {
  type BillingInterval,
  type BillingProviderName,
  isBillingInterval,
} from '@/lib/billing/types';
import { formatPrice, PLAN_ORDER, PLANS, type Plan } from '@/lib/plans';

import { useBillingRedirect } from './use-billing-redirect';

export type PlanPickerProps = {
  currentPlanId: PlanId;
  currentInterval: BillingInterval | null;
  currentStatus: AccountPlan['status'];
  hasStripeCustomer: boolean;
  providerName: BillingProviderName;
  /** Carried over from signup: the plan to highlight and scroll to. */
  preselect?: { planId: PlanId; interval: BillingInterval | null } | null;
};

const buttonLabel = (plan: Plan, isCurrent: boolean, viaPortal: boolean) => {
  if (isCurrent) {
    return 'Current plan';
  }

  if (plan.id === 'hobby') {
    return 'Switch to Hobby';
  }

  return viaPortal ? `Change to ${plan.name} in portal` : `Choose ${plan.name}`;
};

/** Three plan cards with a monthly/yearly toggle. Paid plans go to checkout, Hobby to the portal. */
export const PlanPicker = ({
  currentPlanId,
  currentInterval,
  currentStatus,
  hasStripeCustomer,
  providerName,
  preselect,
}: PlanPickerProps) => {
  const [interval, setInterval] = useState<BillingInterval>(
    preselect?.interval ?? currentInterval ?? 'monthly',
  );
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
  const { go, pending, error } = useBillingRedirect();
  const cards = useRef<Partial<Record<PlanId, HTMLDivElement | null>>>({});
  const highlighted = preselect?.planId ?? null;

  useEffect(() => {
    if (highlighted) {
      cards.current[highlighted]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlighted]);

  // A live Stripe subscription is changed in the portal so Checkout never opens a second one.
  const changeViaPortal =
    providerName === 'stripe' &&
    hasStripeCustomer &&
    currentPlanId !== 'hobby' &&
    currentStatus !== 'canceled';

  const choose = (plan: Plan) => {
    setPendingPlan(plan.id);

    if (plan.id === 'hobby' || changeViaPortal) {
      void go('/api/billing/portal');

      return;
    }

    void go('/api/billing/checkout', { planId: plan.id, interval });
  };

  return (
    <section id="plans" aria-labelledby="plans-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="plans-heading" className="text-base font-semibold">
            Plans
          </h2>
          <p className="text-muted-foreground text-sm">
            Yearly billing is ten months for the price of twelve.
          </p>
        </div>
        <Tabs
          value={interval}
          onValueChange={(value) => {
            if (isBillingInterval(value)) {
              setInterval(value);
            }
          }}
        >
          <TabsList aria-label="Billing interval">
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="yearly">Yearly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const isCurrent =
            planId === currentPlanId && (planId === 'hobby' || currentInterval === interval);
          const isCurrentPlan = planId === currentPlanId;
          const note = interval === 'yearly' ? yearlyNote(plan) : null;
          const busy = pending && pendingPlan === planId;

          return (
            <div
              key={planId}
              ref={(node) => {
                cards.current[planId] = node;
              }}
              data-testid={`plan-${planId}`}
              data-current={isCurrentPlan || undefined}
              data-featured={plan.featured || undefined}
              className={cn(
                'bg-card text-card-foreground ring-foreground/10 relative flex flex-col gap-4 rounded-xl p-5 ring-1',
                plan.featured && 'ring-primary/50',
                highlighted === planId && 'ring-primary ring-2',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold">{plan.name}</h3>
                  <p className="text-muted-foreground text-sm">{plan.tagline}</p>
                </div>
                {isCurrentPlan ? (
                  <Badge variant="secondary">Current</Badge>
                ) : plan.featured ? (
                  <Badge>Featured</Badge>
                ) : null}
              </div>

              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tabular-nums tracking-tight">
                    {formatPrice(interval === 'yearly' ? plan.yearlyCents : plan.monthlyCents)}
                  </span>
                  {plan.monthlyCents > 0 ? (
                    <span className="text-muted-foreground text-sm">
                      {interval === 'yearly' ? 'a year' : 'a month'}
                    </span>
                  ) : null}
                </div>
                <p className="text-muted-foreground min-h-4 text-xs">
                  {note ??
                    (plan.monthlyCents > 0
                      ? `${priceLabel(plan, 'monthly')}, cancel any time`
                      : 'No card needed')}
                </p>
              </div>

              <ul className="flex flex-col gap-1.5 text-sm">
                {plan.highlights.map((highlight) => (
                  <li key={highlight} className="flex items-start gap-2">
                    <Check className="text-primary mt-0.5 size-4 shrink-0" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-2">
                <Button
                  className="w-full"
                  variant={isCurrent ? 'secondary' : planId === 'hobby' ? 'outline' : 'default'}
                  disabled={isCurrent || pending}
                  onClick={() => choose(plan)}
                >
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {busy ? 'Opening' : buttonLabel(plan, isCurrent, changeViaPortal)}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </section>
  );
};
