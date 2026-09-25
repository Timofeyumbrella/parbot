import Link from 'next/link';

import { Badge } from '@/components/ui/badge';

/** Marks a setting the current plan does not include and points at the upgrade. */
export const PlanGate = ({ className }: { className?: string }) => (
  <Badge asChild variant="outline" className={className}>
    <Link href="/billing">Starter and up</Link>
  </Badge>
);
