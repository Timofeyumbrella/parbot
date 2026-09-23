'use client';

import { FlaskConical, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import { type BillingActionState, switchToHobbyMock } from '@/actions/billing';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

type MockPortalCardProps = {
  currentPlanName: string;
  isHobby: boolean;
};

const initialState: BillingActionState = {};

/** Stands in for the Stripe customer portal when billing runs on the mock provider. */
export const MockPortalCard = ({ currentPlanName, isHobby }: MockPortalCardProps) => {
  const [state, formAction, pending] = useActionState(switchToHobbyMock, initialState);

  return (
    <Card className="ring-primary/50" data-testid="mock-portal-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="text-primary size-4" />
          Test-mode portal
        </CardTitle>
        <CardDescription>
          {isHobby
            ? 'You are on Hobby, so there is no subscription to change here.'
            : `You are on ${currentPlanName}. In Stripe this is where you would update the card, download invoices or cancel.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          {isHobby
            ? 'Choose a plan on the Billing screen to start a test subscription.'
            : 'Switching to Hobby takes effect right away and keeps everything you indexed.'}
        </p>
        {state.error ? (
          <p role="alert" className="text-destructive mt-3 text-sm">
            {state.error}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="gap-2">
        {isHobby ? (
          <Button asChild variant="outline">
            <Link href="/billing">Back to billing</Link>
          </Button>
        ) : (
          <form action={formAction} className="flex items-center gap-2">
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? 'Switching' : 'Switch to Hobby'}
            </Button>
            <Button asChild variant="outline">
              <Link href="/billing">Keep plan</Link>
            </Button>
          </form>
        )}
      </CardFooter>
    </Card>
  );
};
