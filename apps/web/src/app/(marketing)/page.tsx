import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Parbot</h1>
      <p className="text-muted-foreground max-w-md">
        Landing page not built yet. Owner: landing.
      </p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/signup">Start free</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
