import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-muted-foreground font-mono text-xs uppercase tracking-widest">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">There is nothing at this address</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        The page may have moved, or the link was wrong. Your assistants are on the dashboard.
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
