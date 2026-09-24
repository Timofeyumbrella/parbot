import Link from 'next/link';

import { Reveal } from '@/components/marketing/reveal';
import { Container } from '@/components/marketing/section';
import { Button } from '@/components/ui/button';

export const ClosingCta = () => (
  <section aria-labelledby="closing-heading" className="border-t py-20 sm:py-28">
    <Container>
      <Reveal>
        <div className="bg-card ring-foreground/10 relative overflow-hidden rounded-2xl px-6 py-14 text-center ring-1 sm:px-12 sm:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_50%_110%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_70%)]"
          />
          <div className="relative flex flex-col items-center gap-6">
            <h2
              id="closing-heading"
              className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              Put an assistant on your docs this afternoon.
            </h2>
            <p className="text-muted-foreground max-w-xl leading-relaxed text-pretty">
              Create an account, paste a URL, add one script tag. Hobby is free, and every answer cites
              its source from the first question.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="px-4">
                <Link href="/signup">Start free</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="px-4">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </Container>
  </section>
);
