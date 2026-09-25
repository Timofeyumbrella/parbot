'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CapacityVerdict } from '@/lib/plans';

export const NewAssistantButton = ({
  capacity,
  planName,
}: {
  capacity: CapacityVerdict;
  planName: string;
}) => {
  if (capacity.allowed) {
    return (
      <Button asChild>
        <Link href="/onboarding">
          <Plus data-icon="inline-start" />
          New assistant
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button gets no pointer events, so the wrapper carries the tooltip. */}
          <span tabIndex={0} className="inline-flex rounded-lg" aria-describedby={undefined}>
            <Button disabled aria-disabled="true">
              <Plus data-icon="inline-start" />
              New assistant
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          The {planName} plan includes {capacity.limit}{' '}
          {capacity.limit === 1 ? 'assistant' : 'assistants'}. Upgrade to add more.
        </TooltipContent>
      </Tooltip>
      <Button asChild variant="outline">
        <Link href="/billing">Upgrade</Link>
      </Button>
    </div>
  );
};
