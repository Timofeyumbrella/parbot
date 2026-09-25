'use client';

import { CircleAlert, RotateCw } from 'lucide-react';
import Link from 'next/link';

import { PageContainer } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * Error boundary for the account level screens. Server errors arrive with their message
 * stripped in production, so the digest is shown to make support conversations concrete.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageContainer className="max-w-xl">
      <div className="bg-card ring-foreground/10 flex flex-col gap-4 rounded-xl p-6 ring-1">
        <div className="flex items-start gap-3">
          <span className="bg-destructive/10 text-destructive flex size-9 shrink-0 items-center justify-center rounded-lg">
            <CircleAlert className="size-4" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-base font-semibold">This screen could not load</h1>
            <p className="text-muted-foreground text-sm">
              {error.message || 'Something went wrong on our side.'} Trying again usually fixes it.
              If it keeps happening, sign out and back in.
            </p>
            {error.digest ? (
              <p className="text-muted-foreground font-mono text-xs">Reference {error.digest}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={reset}>
            <RotateCw data-icon="inline-start" />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to assistants</Link>
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
