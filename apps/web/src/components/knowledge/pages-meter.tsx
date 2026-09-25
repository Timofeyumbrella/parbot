import { cn } from 'cn';
import Link from 'next/link';

import { Progress } from '@/components/ui/progress';
import { formatCount } from '@/lib/format';

export type MeterPlan = { name: string; pages: number };

type PagesMeterProps = {
  used: number;
  plan: MeterPlan;
  className?: string;
};

/** Share of the plan's pages that is used up; it starts warning at four fifths. */
export const NEAR_LIMIT_RATIO = 0.8;

export const PagesMeter = ({ used, plan, className }: PagesMeterProps) => {
  const ratio = plan.pages > 0 ? Math.min(used / plan.pages, 1) : 1;
  const nearLimit = ratio >= NEAR_LIMIT_RATIO;
  const atLimit = ratio >= 1;

  return (
    <div className={cn('flex w-48 flex-col gap-1.5 text-xs', className)} data-testid="pages-meter">
      <div className="flex items-baseline justify-between gap-2">
        <span className="tabular-nums">
          <span className="text-foreground font-medium">{formatCount(used)}</span>
          <span className="text-muted-foreground"> of {formatCount(plan.pages)} pages</span>
        </span>
        <span className="text-muted-foreground">{plan.name}</span>
      </div>
      <Progress
        value={ratio * 100}
        aria-label={`${used} of ${plan.pages} pages used on the ${plan.name} plan`}
        className={cn(
          nearLimit && !atLimit && '[&_[data-slot=progress-indicator]]:bg-warning',
          atLimit && '[&_[data-slot=progress-indicator]]:bg-destructive',
        )}
      />
      {nearLimit ? (
        <Link href="/billing" className="text-foreground underline-offset-4 hover:underline">
          {atLimit
            ? 'Page limit reached. Upgrade on Billing'
            : 'Close to the limit. See plans on Billing'}
        </Link>
      ) : null}
    </div>
  );
};
