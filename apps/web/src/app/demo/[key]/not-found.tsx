import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function DemoNotFound() {
  return (
    <main className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">No assistant has this key</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        The public key in this address does not match any assistant. Keys start with pb_ and are shown, with the
        exact demo link, on the Widget page of your assistant.
      </p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/dashboard">Go to the dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </main>
  );
}
