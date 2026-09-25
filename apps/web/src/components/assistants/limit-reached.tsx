import { ArrowRight, Bot } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CapacityVerdict, Plan } from '@/lib/plans';

/** Shown instead of the create form when the plan has no room for another assistant. */
export const LimitReached = ({ plan, capacity }: { plan: Plan; capacity: CapacityVerdict }) => (
  <Card>
    <CardHeader>
      <div className="flex items-center gap-3">
        <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Bot className="size-4" />
        </span>
        <div className="flex flex-col gap-1">
          <CardTitle>
            The {plan.name} plan includes {capacity.limit}{' '}
            {capacity.limit === 1 ? 'assistant' : 'assistants'}
          </CardTitle>
          <CardDescription>
            This account already has {capacity.used}. Move to a bigger plan to add another, or
            delete one you no longer need from its settings.
          </CardDescription>
        </div>
      </div>
    </CardHeader>
    <CardContent className="flex flex-wrap gap-2">
      <Button asChild>
        <Link href="/billing">
          See plans
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to assistants</Link>
      </Button>
    </CardContent>
  </Card>
);
