'use client';

import { FlaskConical, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import { applyMockPlan, type BillingActionState } from '@/actions/billing';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { priceLabel } from '@/lib/billing/pricing';
import type { BillingInterval, PaidPlanId } from '@/lib/billing/types';
import { formatCount } from '@/lib/format';
import { PLANS } from '@/lib/plans';

type MockPlanConfirmProps = {
  planId: PaidPlanId;
  interval: BillingInterval;
};

const initialState: BillingActionState = {};

/** Stands in for the Stripe Checkout page when billing runs on the mock provider. */
export const MockPlanConfirm = ({ planId, interval }: MockPlanConfirmProps) => {
  const [state, formAction, pending] = useActionState(applyMockPlan, initialState);
  const plan = PLANS[planId];

  return (
    <Card className="ring-primary/50" data-testid="mock-plan-confirm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="text-primary size-4" />
          Apply {plan.name} in test mode
        </CardTitle>
        <CardDescription>
          {priceLabel(plan, interval)}, billed {interval}. No card is charged and the plan renews in
          30 days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          This is what Stripe Checkout would do: your account moves to {plan.name} with{' '}
          {plan.assistants} assistants, {formatCount(plan.pages)} indexed pages and{' '}
          {formatCount(plan.messagesPerMonth)} answers a month.
        </p>
        {state.error ? (
          <p role="alert" className="text-destructive mt-3 text-sm">
            {state.error}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="gap-2">
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="interval" value={interval} />
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {pending ? 'Applying' : `Apply ${plan.name}`}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/billing?checkout=cancelled">Cancel</Link>
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
};
