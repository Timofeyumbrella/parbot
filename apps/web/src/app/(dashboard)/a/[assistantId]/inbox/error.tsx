'use client';

import { useEffect } from 'react';

import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export default function InboxError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer>
      <PageHeader title="Inbox" description="The inbox could not be shown." />
      <div role="alert" className="border-destructive/40 bg-destructive/10 flex flex-col gap-3 rounded-lg border p-4 text-sm">
        <p>
          Something went wrong while loading the conversations
          {error.digest ? ` (reference ${error.digest})` : ''}. Your data is intact; the page just failed to render.
        </p>
        <div>
          <Button size="sm" variant="outline" onClick={() => reset()}>
            Try again
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
