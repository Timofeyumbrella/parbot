'use client';

import { useEffect } from 'react';

import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export default function ConversationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer>
      <PageHeader title="Conversation" description="The transcript could not be shown." />
      <div
        role="alert"
        className="border-destructive/40 bg-destructive/10 flex flex-col gap-3 rounded-lg border p-4 text-sm"
      >
        <p>
          Something went wrong while loading this conversation
          {error.digest ? ` (reference ${error.digest})` : ''}. Nothing was changed.
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
