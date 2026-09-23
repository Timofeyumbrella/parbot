'use client';

import { RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export default function BillingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Billing screen failed', error);
  }, [error]);

  return (
    <PageContainer>
      <PageHeader
        title="Billing could not be loaded"
        description="Your plan and usage did not come back from the database. Nothing about your subscription has changed."
        actions={
          <Button onClick={reset} variant="outline">
            <RotateCcw />
            Try again
          </Button>
        }
      />
      {error.digest ? <p className="text-muted-foreground text-xs">Reference: {error.digest}</p> : null}
    </PageContainer>
  );
}
