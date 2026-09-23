'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Container } from '@/components/marketing/section';
import { Button } from '@/components/ui/button';

type ErrorProps = {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
};

export default function MarketingError({ error, retry, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="flex flex-1 items-center py-20">
      <Container className="flex max-w-xl flex-col items-start gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">This page could not be loaded.</h1>
        <p className="text-muted-foreground leading-relaxed">
          Something went wrong while rendering the landing page
          {error.digest ? ` (reference ${error.digest})` : ''}. Try again, or go straight to sign in.
        </p>
        <div className="flex gap-2">
          <Button type="button" onClick={() => (retry ?? reset)()}>
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </Container>
    </main>
  );
}
