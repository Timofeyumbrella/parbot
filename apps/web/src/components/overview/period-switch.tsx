'use client';

import {
  pillActiveClass,
  pillInactiveClass,
  pillLinkClass,
  pillNavClass,
  SegmentedLink,
} from '@/components/inbox/pending-nav';
import { PERIODS, type PeriodDays } from '@/lib/analytics';

/** Links, not client state: the period lives in the URL so it survives reloads and sharing. */
export const PeriodSwitch = ({ assistantId, days }: { assistantId: string; days: PeriodDays }) => (
  <nav aria-label="Period" className={pillNavClass}>
    {PERIODS.map((period) => (
      <SegmentedLink
        key={period}
        href={`/a/${assistantId}?days=${period}`}
        group="period"
        active={period === days}
        className={pillLinkClass}
        activeClassName={pillActiveClass}
        inactiveClassName={pillInactiveClass}
      >
        {period} days
      </SegmentedLink>
    ))}
  </nav>
);
