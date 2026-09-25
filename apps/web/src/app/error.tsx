'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function RootError({
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
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-muted-foreground font-mono text-xs uppercase tracking-widest">
        Something broke
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">This screen could not be shown</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        {error.message || 'An unexpected error happened.'}
        {error.digest ? ` (reference ${error.digest})` : ''}
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
