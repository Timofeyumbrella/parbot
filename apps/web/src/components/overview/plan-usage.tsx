import { cn } from 'cn';

import { dayLabel } from '@/lib/analytics';
import { USAGE_WARNING_PERCENT, usagePercent } from '@/lib/billing/pricing';
import { formatCount, plural } from '@/lib/format';
import type { UsageProjection } from '@/lib/overview';

import { NextStep, Section } from './section';

export type PlanUsageProps = {
  planName: string;
  projection: UsageProjection;
};

/**
 * The account's answers this month against its plan, and where the month ends at the current
 * pace. The meter shows what is used and, lighter, what the pace adds by the end of the month.
 * Days read in UTC (`dayLabel`), the calendar the usage counter resets on.
 */
export const PlanUsage = ({ planName, projection }: PlanUsageProps) => {
  const { used, limit, projected, exceedsLimit, limitReachedOn, resetsOn } = projection;
  const usedPercent = usagePercent(used, limit);
  const projectedPercent = usagePercent(projected, limit);
  const full = used >= limit;
  const warning = !full && (exceedsLimit || usedPercent >= USAGE_WARNING_PERCENT);
  const tone = full ? 'bg-destructive' : warning ? 'bg-warning' : 'bg-primary';

  return (
    <Section
      testId="plan-usage"
      title="Usage against the plan"
      why={`Answers used on your account this month, against the ${planName} plan. When they run out, readers stop getting answers.`}
      footer={
        exceedsLimit ? (
          <NextStep href="/billing">Compare plans in Billing</NextStep>
        ) : (
          `The count resets on ${dayLabel(resetsOn)}.`
        )
      }
    >
      <div className="px-(--card-spacing) flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm">
            <span className="text-2xl font-semibold tracking-tight" data-testid="usage-used">
              {formatCount(used)}
            </span>{' '}
            <span className="text-muted-foreground">of {plural(limit, 'answer')} used</span>
          </p>
          <span className="text-muted-foreground text-xs tabular-nums">{usedPercent}%</span>
        </div>

        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
          aria-label={`Answers this month: ${formatCount(used)} of ${formatCount(limit)}`}
          className="bg-muted relative h-2 overflow-hidden rounded-full"
        >
          {/* The pace's share first, underneath, so the used part sits on top of it. */}
          <div
            className={cn('absolute inset-y-0 left-0 rounded-full opacity-30', tone)}
            style={{ width: `${projectedPercent}%` }}
            data-testid="usage-projected-bar"
          />
          <div
            className={cn('absolute inset-y-0 left-0 rounded-full', tone)}
            style={{ width: `${usedPercent}%` }}
          />
        </div>

        <p
          className={cn(
            'text-sm',
            full ? 'text-destructive' : warning ? 'text-warning' : 'text-muted-foreground',
          )}
          data-testid="usage-projection"
        >
          {full
            ? `The limit is reached. Readers get no answers until ${dayLabel(resetsOn)} unless you move to a bigger plan.`
            : used === 0
              ? 'No answers used yet this month.'
              : `At this pace you will use about ${formatCount(projected)} of ${formatCount(limit)} this month${
                  exceedsLimit && limitReachedOn
                    ? `, and reach the limit around ${dayLabel(limitReachedOn)}.`
                    : '.'
                }`}
        </p>
      </div>
    </Section>
  );
};
