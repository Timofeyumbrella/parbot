'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/** Shown when the chat frame itself fails, for instance when the conversation list cannot be read. */
export default function ChatError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
      <AlertCircle className="text-destructive size-6" />
      <p className="text-sm font-medium">The chat could not be loaded.</p>
      <p className="text-muted-foreground max-w-md text-sm">
        {error.message || 'Something went wrong while reading your conversations.'} Try again, and if it keeps
        happening, reload the page.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={reset}>
        <RotateCcw data-icon="inline-start" />
        Try again
      </Button>
    </div>
  );
}
