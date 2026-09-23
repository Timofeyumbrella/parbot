import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { Progress } from '@/components/ui/progress';
import type { AccountUsage } from '@/lib/account';
import { checkCapacity, type Plan } from '@/lib/plans';

const Meter = ({ label, used, limit }: { label: string; used: number; limit: number }) => {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const full = used >= limit;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={full ? 'text-warning font-medium tabular-nums' : 'tabular-nums'}>
          {used.toLocaleString('en-US')} / {limit.toLocaleString('en-US')}
        </span>
      </div>
      <Progress value={percent} aria-label={`${label}: ${used} of ${limit}`} className={full ? '[&_[data-slot=progress-indicator]]:bg-warning' : undefined} />
    </div>
  );
};

/** Plan name and the three limits at a glance, with the way to the billing page. */
export const PlanStrip = ({ plan, usage }: { plan: Plan; usage: AccountUsage }) => {
  const assistants = checkCapacity(plan.id, usage.assistants, 'assistants');
  const pages = checkCapacity(plan.id, usage.pages, 'pages');
  const answers = checkCapacity(plan.id, usage.messagesThisMonth, 'messagesPerMonth');

  return (
    <section
      aria-label="Plan"
      className="bg-card ring-foreground/10 flex flex-col gap-4 rounded-xl p-4 ring-1 sm:flex-row sm:items-center sm:gap-6"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-start sm:gap-0.5">
        <span className="text-sm font-medium">{plan.name} plan</span>
        <Link href="/billing" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs">
          {plan.id === 'hobby' ? 'Upgrade' : 'Manage billing'}
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
      <div className="grid flex-1 gap-4 sm:grid-cols-3">
        <Meter label="Assistants" used={assistants.used} limit={assistants.limit} />
        <Meter label="Pages indexed" used={pages.used} limit={pages.limit} />
        <Meter label="Answers this month" used={answers.used} limit={answers.limit} />
      </div>
    </section>
  );
};
