import { cn } from 'cn';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { AccountUsage } from '@/lib/account';
import { USAGE_WARNING_PERCENT, usagePercent } from '@/lib/billing/pricing';
import { formatCount } from '@/lib/format';
import type { Plan } from '@/lib/plans';

type MeterProps = {
  label: string;
  used: number;
  limit: number;
};

export const UsageMeter = ({ label, used, limit }: MeterProps) => {
  const percent = usagePercent(used, limit);
  const full = percent >= 100;
  const warning = !full && percent >= USAGE_WARNING_PERCENT;

  return (
    <div
      className="flex flex-col gap-1.5"
      data-testid={`meter-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span
          className={cn(
            'text-muted-foreground tabular-nums',
            warning && 'text-warning',
            full && 'text-destructive',
          )}
        >
          {formatCount(used)} of {formatCount(limit)}
        </span>
      </div>
      <Progress
        value={percent}
        aria-label={`${label}: ${formatCount(used)} of ${formatCount(limit)}`}
        className={cn(
          'h-1.5',
          warning && '[&_[data-slot=progress-indicator]]:bg-warning',
          full && '[&_[data-slot=progress-indicator]]:bg-destructive',
        )}
      />
      {full ? (
        <p className="text-destructive text-xs">
          At the limit. Move to a bigger plan to keep going.
        </p>
      ) : warning ? (
        <p className="text-warning text-xs">Close to the limit.</p>
      ) : null}
    </div>
  );
};

type UsageMetersProps = {
  usage: AccountUsage;
  plan: Plan;
  className?: string;
};

/** The limits a plan sets, with how much of each the account has used. */
export const UsageMeters = ({ usage, plan, className }: UsageMetersProps) => (
  <Card className={className}>
    <CardHeader>
      <CardTitle>Usage</CardTitle>
      <CardDescription>
        Against the {plan.name} limits. Answers reset on the first of the month.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <UsageMeter label="Indexed pages" used={usage.pages} limit={plan.pages} />
      <UsageMeter
        label="Answers this month"
        used={usage.messagesThisMonth}
        limit={plan.messagesPerMonth}
      />
    </CardContent>
  </Card>
);
