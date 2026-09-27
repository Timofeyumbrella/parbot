import { cn } from 'cn';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

import type { Change } from '@/lib/overview';

const TONE = {
  good: 'text-success',
  bad: 'text-destructive',
  neutral: 'text-muted-foreground',
} as const;

/**
 * How a number moved against the previous period of the same length. The arrow and the word
 * carry the direction and the colour says whether that is good, so it never rests on colour alone.
 */
export const ChangeLine = ({
  change,
  amount,
  days,
}: {
  change: Change | null;
  /** The size of the change as it should read, such as "6 pts" or "0.3 s". */
  amount: string;
  days: number;
}) => {
  if (!change) {
    return (
      <p className="text-muted-foreground text-xs" data-testid="change" data-direction="none">
        Nothing to compare with in the {days} days before
      </p>
    );
  }

  const Icon =
    change.direction === 'up' ? ArrowUp : change.direction === 'down' ? ArrowDown : Minus;
  const label =
    change.direction === 'flat'
      ? 'No change'
      : `${change.direction === 'up' ? 'Up' : 'Down'} ${amount}`;

  return (
    <p
      className="flex flex-wrap items-center gap-x-1 text-xs"
      data-testid="change"
      data-direction={change.direction}
      data-tone={change.tone}
    >
      <span className={cn('inline-flex items-center gap-0.5 font-medium', TONE[change.tone])}>
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </span>
      <span className="text-muted-foreground">on the {days} days before</span>
    </p>
  );
};
