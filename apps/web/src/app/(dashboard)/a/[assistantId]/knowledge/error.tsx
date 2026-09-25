'use client';

import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * Shown when the first paint itself failed. A production build replaces a server error's text
 * with a generic digest notice, so the message is ours and the detail appears only in development.
 */
export default function KnowledgeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const detail = process.env.NODE_ENV === 'development' ? error.message : null;

  return (
    <PageContainer>
      <PageHeader title="Knowledge" description="Everything the assistant answers from." />
      <div
        role="alert"
        className="border-destructive/30 bg-destructive/10 flex flex-col items-start gap-3 rounded-xl border px-4 py-4 text-sm"
      >
        <div className="flex flex-col gap-1">
          <p>
            The sources could not be loaded. Check your connection and try again; if it keeps
            happening, sign out and back in.
          </p>
          {detail ? <p className="text-muted-foreground break-words text-xs">{detail}</p> : null}
          {error.digest ? (
            <p className="text-muted-foreground text-xs">Reference {error.digest}</p>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          Try again
        </Button>
      </div>
    </PageContainer>
  );
}
