import Link from 'next/link';

import { LiveDemo } from '@/components/marketing/live-demo';
import { ScriptedDemo } from '@/components/marketing/scripted-demo';
import { Container } from '@/components/marketing/section';
import { Button } from '@/components/ui/button';

export const HERO_HEADLINE = 'Give your docs an assistant that cites its sources.';

/** The first screen: the promise, two calls to action and a demo panel that answers. */
export const Hero = ({ demoKey }: { demoKey: string | null }) => (
  <section aria-labelledby="hero-heading" className="relative overflow-hidden pt-14 pb-20 sm:pt-20 sm:pb-28">
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_70%)]"
    />
    <Container className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
      <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-6 duration-700 motion-reduce:animate-none">
        <p className="text-primary text-xs font-medium tracking-[0.14em] uppercase">Ask-AI for developer docs</p>
        <h1
          id="hero-heading"
          className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]"
        >
          {HERO_HEADLINE}
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg leading-relaxed text-pretty">
          Parbot reads your documentation and answers readers&apos; questions in a floating bubble or a
          ⌘K palette, streaming each answer with links to the pages it came from. When the docs do not
          cover something, it says so, offers to take an email, and the question lands in your inbox.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="px-4">
            <Link href="/signup">Start free</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="px-4">
            <Link href="/#pricing">See pricing</Link>
          </Button>
        </div>
        <ul className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <li>Hobby is free. No card needed.</li>
          <li>One script tag to install.</li>
          {demoKey ? (
            <li>
              Press{' '}
              <kbd className="bg-muted rounded-md border px-1.5 py-0.5 font-mono text-xs">⌘K</kbd> to try it
              here.
            </li>
          ) : null}
        </ul>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-3 delay-150 duration-700 motion-reduce:animate-none">
        {demoKey ? <LiveDemo demoKey={demoKey} /> : <ScriptedDemo />}
        <p className="text-muted-foreground text-center text-xs">
          {demoKey
            ? 'A real assistant answering from its documentation. Ask it anything.'
            : 'A scripted example. Sign up to point Parbot at your own docs.'}
        </p>
      </div>
    </Container>
  </section>
);
