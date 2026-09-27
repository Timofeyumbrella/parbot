import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { demoPageHref } from '@/components/marketing/demo-key';
import { ScriptedDemo } from '@/components/marketing/scripted-demo';
import { Container } from '@/components/marketing/section';
import { Button } from '@/components/ui/button';

export const HERO_HEADLINE = 'Give your docs an assistant that cites its sources.';

type HeroProps = {
  /**
   * The public key of the real widget on the page, or null when there is none. With one, a wide
   * screen points at the ⌘K palette and a narrow one, where the pill is hidden and a phone has no
   * ⌘K, links to the same assistant on its demo page.
   */
  demoKey: string | null;
};

/**
 * The live demo link below the hero's two-column width: a tap target, not a shortcut. The
 * vertical padding, taken back by the margin, gives a thumb more to hit without moving the text.
 */
const LiveDemoLink = ({
  demoKey,
  arrow = false,
  children,
}: {
  demoKey: string;
  arrow?: boolean;
  children: React.ReactNode;
}) => (
  <a
    href={demoPageHref(demoKey)}
    className="text-foreground -my-2.5 inline-flex items-center gap-1 py-2.5 font-medium underline underline-offset-4"
  >
    {children}
    {arrow ? <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" /> : null}
  </a>
);

/** The first screen: the promise, two calls to action and a scripted example of the product in use. */
export const Hero = ({ demoKey }: HeroProps) => (
  <section
    aria-labelledby="hero-heading"
    className="relative overflow-hidden pb-20 pt-14 sm:pb-28 sm:pt-20"
  >
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_70%)]"
    />
    {/* One shrinkable column on a phone: an auto track would widen to the longest line in the demo. */}
    <Container className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
      <div className="animate-in fade-in slide-in-from-bottom-2 flex min-w-0 flex-col gap-6 duration-700 motion-reduce:animate-none">
        <p className="text-primary text-xs font-medium uppercase tracking-[0.14em]">
          Ask-AI for developer docs
        </p>
        <h1
          id="hero-heading"
          className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]"
        >
          {HERO_HEADLINE}
        </h1>
        <p className="text-muted-foreground max-w-xl text-pretty text-lg leading-relaxed">
          Parbot reads your documentation and answers readers&apos; questions in a floating bubble
          or a ⌘K palette, streaming each answer with the pages it came from listed underneath. When
          the docs do not cover something, it says so, can ask for the reader&apos;s email, and the
          question lands in your inbox.
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
            <>
              <li className="hidden lg:list-item" data-testid="palette-hint">
                Press{' '}
                <kbd className="bg-muted rounded-md border px-1.5 py-0.5 font-mono text-xs">⌘K</kbd>{' '}
                to try it here.
              </li>
              <li className="lg:hidden" data-testid="live-demo-hint">
                <LiveDemoLink demoKey={demoKey} arrow>
                  Try it live on the Parbot docs
                </LiveDemoLink>
              </li>
            </>
          ) : null}
        </ul>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 flex min-w-0 flex-col gap-3 delay-150 duration-700 motion-reduce:animate-none">
        <ScriptedDemo />
        <p className="text-muted-foreground text-pretty text-center text-xs">
          A scripted example on fictional docs.{' '}
          {demoKey ? (
            <>
              <span className="hidden lg:inline">
                The ⌘K palette on this page answers live from the Parbot docs.
              </span>
              <span className="lg:hidden">
                A live one answers from the Parbot docs on{' '}
                <LiveDemoLink demoKey={demoKey}>the demo page</LiveDemoLink>.
              </span>
            </>
          ) : (
            'Sign up to point Parbot at your own.'
          )}
        </p>
      </div>
    </Container>
  </section>
);
