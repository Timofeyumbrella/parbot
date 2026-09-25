import { Bot, Command, MessageCircle, Search } from 'lucide-react';

import { plansWith } from '@/components/marketing/plan-copy';
import { Reveal } from '@/components/marketing/reveal';
import { Container, Section, SectionHeading } from '@/components/marketing/section';
import { Snippet } from '@/components/marketing/snippet';

export const embedSnippet = (appUrl: string) =>
  `<script src="${appUrl.replace(/\/$/, '')}/widget.js" data-parbot="pb_your_public_key" async></script>`;

/** A few lines standing in for a docs page, so both modes sit on the same backdrop. */
const DocsPage = ({
  alt,
  children,
  dim = false,
}: {
  alt: string;
  children?: React.ReactNode;
  dim?: boolean;
}) => (
  <div
    role="img"
    aria-label={alt}
    className="bg-background ring-foreground/10 relative aspect-[4/3] overflow-hidden rounded-lg ring-1"
  >
    <div aria-hidden="true" className="contents">
      <div className="flex h-7 items-center gap-1.5 border-b px-3">
        <span className="bg-foreground/15 size-2 rounded-full" />
        <span className="bg-foreground/15 size-2 rounded-full" />
        <span className="bg-foreground/15 size-2 rounded-full" />
        <span className="bg-muted text-muted-foreground ml-2 flex h-4 flex-1 items-center rounded-sm px-2 font-mono text-[9px]">
          docs.acme.dev/webhooks/verify
        </span>
      </div>
      <div className="flex h-full gap-4 p-4">
        <div className="hidden w-1/4 flex-col gap-2 sm:flex">
          <span className="bg-foreground/15 h-2 w-3/4 rounded" />
          <span className="bg-foreground/10 h-2 w-1/2 rounded" />
          <span className="bg-foreground/10 h-2 w-2/3 rounded" />
          <span className="bg-primary/60 h-2 w-3/5 rounded" />
          <span className="bg-foreground/10 h-2 w-1/2 rounded" />
          <span className="bg-foreground/10 h-2 w-2/3 rounded" />
        </div>
        <div className="flex flex-1 flex-col gap-2.5">
          <span className="bg-foreground/25 h-3 w-2/3 rounded" />
          <span className="bg-foreground/10 h-2 w-full rounded" />
          <span className="bg-foreground/10 h-2 w-11/12 rounded" />
          <span className="bg-foreground/10 h-2 w-4/5 rounded" />
          <span className="bg-muted mt-1 h-12 w-full rounded" />
          <span className="bg-foreground/10 h-2 w-full rounded" />
          <span className="bg-foreground/10 h-2 w-3/4 rounded" />
        </div>
      </div>
      {dim ? <div className="bg-background/70 absolute inset-0" /> : null}
      {children}
    </div>
  </div>
);

const BubbleIllustration = () => (
  <DocsPage alt="A docs page with a round launcher in the bottom corner and an open chat panel showing a cited answer">
    <div className="bg-card ring-foreground/10 absolute bottom-14 right-12 flex w-[62%] max-w-[15rem] flex-col rounded-lg shadow-xl shadow-black/20 ring-1 sm:bottom-16 sm:right-14">
      <div className="flex h-7 items-center gap-1.5 border-b px-2.5 text-[10px] font-medium">
        <span className="bg-primary size-1.5 rounded-full" />
        Acme Docs
      </div>
      <div className="flex flex-col gap-2 p-2.5 text-[10px] leading-snug">
        <p className="bg-muted self-end rounded-md rounded-br-sm px-2 py-1">Do webhooks retry?</p>
        <div className="flex gap-1.5">
          <span className="bg-primary text-primary-foreground mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm">
            <Bot className="size-2.5" />
          </span>
          <p>
            Yes. Failed deliveries retry with backoff for 24 hours
            <span className="bg-primary/15 text-primary ml-0.5 inline-flex h-3 min-w-3 items-center justify-center rounded-sm px-0.5 font-mono text-[8px] font-semibold">
              1
            </span>
          </p>
        </div>
      </div>
      <div className="m-2 mt-0 flex h-6 items-center rounded-md border px-2 text-[9px]">
        <span className="text-muted-foreground">Ask a question</span>
      </div>
    </div>
    <span className="bg-primary text-primary-foreground absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full shadow-lg sm:bottom-4 sm:right-4 sm:size-9">
      <MessageCircle className="size-4" />
    </span>
  </DocsPage>
);

const PaletteIllustration = () => (
  <DocsPage
    alt="A docs page dimmed behind a command palette with a question box and three suggested questions"
    dim
  >
    <div className="bg-popover ring-foreground/10 absolute inset-x-6 top-12 flex flex-col rounded-lg shadow-xl shadow-black/20 ring-1 sm:inset-x-10 sm:top-14">
      <div className="flex h-9 items-center gap-2 border-b px-3 text-[11px]">
        <Search className="text-muted-foreground size-3.5" />
        <span className="text-muted-foreground flex-1">Ask the docs</span>
        <kbd className="bg-muted rounded border px-1 py-0.5 font-mono text-[9px]">⌘K</kbd>
      </div>
      <ul className="flex flex-col gap-0.5 p-1.5 text-[10px]">
        <li className="bg-muted flex items-center gap-2 rounded-md px-2 py-1.5 font-medium">
          <Command className="size-3" />
          How do I verify a webhook signature?
        </li>
        <li className="text-muted-foreground flex items-center gap-2 rounded-md px-2 py-1.5">
          <Command className="size-3" />
          Where do I find my API key?
        </li>
        <li className="text-muted-foreground flex items-center gap-2 rounded-md px-2 py-1.5">
          <Command className="size-3" />
          What are the rate limits?
        </li>
      </ul>
      <div className="text-muted-foreground border-t px-3 py-1.5 text-[9px]">
        Answers cite the page they came from
      </div>
    </div>
  </DocsPage>
);

const MODES = [
  {
    name: 'Bubble',
    description:
      'A launcher in the corner of every page. Readers open it when they have a question and keep reading while the answer streams in. Included on every plan.',
    illustration: <BubbleIllustration />,
  },
  {
    name: '⌘K palette',
    description: `Opens over the page with the shortcut developers already reach for, Ctrl+K on Windows and Linux. Suggested questions first, then the answer with the page it came from. On ${plansWith('palette')}.`,
    illustration: <PaletteIllustration />,
  },
] as const;

export const EmbedModes = ({ appUrl }: { appUrl: string }) => (
  <Section id="product" className="border-t">
    <Container className="flex flex-col gap-12">
      <Reveal>
        <SectionHeading
          id="product"
          eyebrow="Two ways to embed"
          title="One script tag. A bubble or a palette."
          lede="Paste the snippet into your docs site once. Choose a floating bubble or a ⌘K palette per assistant from the dashboard, and switch later without touching the site again."
        />
      </Reveal>

      <div className="grid gap-8 md:grid-cols-2">
        {MODES.map((mode, position) => (
          <Reveal key={mode.name} delay={position * 90} className="flex flex-col gap-4">
            <figure className="flex flex-col gap-4">
              {mode.illustration}
              <figcaption className="flex flex-col gap-1">
                <h3 className="text-base font-semibold">{mode.name}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{mode.description}</p>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>

      <Reveal className="flex flex-col gap-3">
        <Snippet code={embedSnippet(appUrl)} label="Widget install snippet" />
        <p className="text-muted-foreground text-sm leading-relaxed">
          Replace the key with the one from your assistant&apos;s Widget screen. Add{' '}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
            data-mode=&quot;palette&quot;
          </code>{' '}
          or{' '}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
            data-mode=&quot;bubble&quot;
          </code>{' '}
          to override the mode set in the dashboard, and{' '}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
            data-launcher=&quot;false&quot;
          </code>{' '}
          to hide the launcher and rely on the shortcut.
        </p>
      </Reveal>
    </Container>
  </Section>
);
