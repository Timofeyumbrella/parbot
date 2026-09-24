import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { AccountPlan } from '@/lib/account';
import { formatPeriodEnd, priceLabel } from '@/lib/billing/pricing';
import type { BillingProviderName } from '@/lib/billing/types';

import { ManageSubscriptionButton } from './manage-subscription-button';

type CurrentPlanCardProps = {
  account: AccountPlan;
  providerName: BillingProviderName;
  className?: string;
};

const statusBadge = (account: AccountPlan) => {
  switch (account.status) {
    case 'past_due':
      return { label: 'Past due', variant: 'destructive' as const };
    case 'trialing':
      return { label: 'Trial', variant: 'secondary' as const };
    case 'incomplete':
      return { label: 'Payment pending', variant: 'secondary' as const };
    case 'canceled':
      return { label: 'Ended', variant: 'outline' as const };
    default:
      return account.cancelAtPeriodEnd
        ? { label: 'Ending', variant: 'outline' as const }
        : { label: 'Active', variant: 'secondary' as const };
  }
};

/** One sentence about what happens next with the subscription. */
export const renewalLine = (account: AccountPlan) => {
  const date = formatPeriodEnd(account.currentPeriodEnd);

  if (account.status === 'canceled') {
    return 'Your paid subscription ended. You are on Hobby.';
  }

  if (account.plan.id === 'hobby') {
    return 'Free, with no card on file. Choose a plan below to raise the limits.';
  }

  if (account.status === 'past_due') {
    return 'The last payment failed. Update your card in the portal to keep the plan.';
  }

  if (account.status === 'incomplete') {
    return 'The first payment has not gone through yet. Finish it in the portal.';
  }

  if (account.status === 'trialing') {
    return date ? `Trial ends on ${date}.` : 'On trial.';
  }

  if (account.cancelAtPeriodEnd) {
    return date ? `Ends on ${date}. You keep the plan until then.` : 'Ends at the close of the current period.';
  }

  return date ? `Renews on ${date}.` : 'Renews automatically.';
};

export const CurrentPlanCard = ({ account, providerName, className }: CurrentPlanCardProps) => {
  const badge = statusBadge(account);
  const isPaid = account.plan.id !== 'hobby';
  // In test mode the portal is a card on this screen, so it is always reachable; with Stripe it needs a customer.
  const canManage = account.hasStripeCustomer || providerName === 'mock';
  const price = account.billingInterval && isPaid ? priceLabel(account.plan, account.billingInterval) : 'Free';

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Current plan</CardTitle>
        <CardDescription>{account.plan.tagline}</CardDescription>
        <CardAction>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight">{account.plan.name}</span>
          <span className="text-muted-foreground text-sm">{price}</span>
        </div>
        <p className="text-muted-foreground text-sm">{renewalLine(account)}</p>
      </CardContent>
      <CardFooter className="gap-3">
        {canManage ? (
          <ManageSubscriptionButton />
        ) : (
          <p className="text-muted-foreground text-sm">Nothing to manage yet. Pick a plan below when you are ready.</p>
        )}
      </CardFooter>
    </Card>
  );
};
