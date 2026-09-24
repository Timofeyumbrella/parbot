'use client';

import { ExternalLink, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { useBillingRedirect } from './use-billing-redirect';

/** Opens the Stripe customer portal, or the mock portal card when billing runs in test mode. */
export const ManageSubscriptionButton = () => {
  const { go, pending, error } = useBillingRedirect();

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" disabled={pending} onClick={() => go('/api/billing/portal')}>
        {pending ? <Loader2 className="animate-spin" /> : <ExternalLink />}
        {pending ? 'Opening portal' : 'Manage subscription'}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
};
