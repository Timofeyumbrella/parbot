import { cn } from 'cn';
import Link from 'next/link';

import { PERIODS, type PeriodDays } from '@/lib/analytics';

/** Links, not client state: the period lives in the URL so it survives reloads and sharing. */
export const PeriodSwitch = ({ assistantId, days }: { assistantId: string; days: PeriodDays }) => (
  <nav aria-label="Period" className="bg-muted text-muted-foreground inline-flex h-8 items-center rounded-lg p-[3px]">
    {PERIODS.map((period) => {
      const active = period === days;

      return (
        <Link
          key={period}
          href={`/a/${assistantId}?days=${period}`}
          prefetch
          aria-current={active ? 'page' : undefined}
          className={cn(
            'inline-flex h-full items-center rounded-md px-2.5 text-sm font-medium transition-colors',
            active
              ? 'bg-background text-foreground dark:bg-input/30 dark:border-input border border-transparent shadow-sm'
              : 'hover:text-foreground',
          )}
        >
          {period} days
        </Link>
      );
    })}
  </nav>
);
