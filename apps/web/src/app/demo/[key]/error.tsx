'use client';

import { CircleAlert, RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * The demo page failed to load: usually the database was unreachable while the key was looked
 * up. The error's own text is never shown; it names libraries and hosts, which is not copy.
 */
export default function DemoError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="bg-destructive/10 text-destructive flex size-10 items-center justify-center rounded-lg">
        <CircleAlert className="size-5" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">The demo page could not load</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        The assistant behind this key could not be looked up. Trying again usually fixes it.
      </p>
      {error.digest ? <p className="text-muted-foreground font-mono text-xs">Reference {error.digest}</p> : null}
      <Button onClick={reset}>
        <RotateCw data-icon="inline-start" />
        Try again
      </Button>
    </main>
  );
}
