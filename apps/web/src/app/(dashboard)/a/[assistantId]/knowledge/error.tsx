'use client';

import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/** Shown when the first paint itself failed; the message names what went wrong. */
export default function KnowledgeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageContainer>
      <PageHeader title="Knowledge" description="Everything the assistant answers from." />
      <div
        role="alert"
        className="border-destructive/30 bg-destructive/10 flex flex-col items-start gap-3 rounded-xl border px-4 py-4 text-sm"
      >
        <p>The sources could not be loaded. {error.message || 'Something went wrong on the way to the database.'}</p>
        <Button variant="outline" size="sm" onClick={reset}>
          Try again
        </Button>
      </div>
    </PageContainer>
  );
}
