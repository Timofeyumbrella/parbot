import { Reveal } from '@/components/marketing/reveal';
import { Container, Section, SectionHeading } from '@/components/marketing/section';

export const STEPS = [
  {
    title: 'Point it at your docs',
    body: 'Give Parbot a docs URL, a sitemap, or files: PDF, Word, Markdown, HTML or plain text. It fetches each page, strips the navigation and splits the content into passages along its headings.',
    detail: 'https://docs.acme.dev/sitemap.xml',
  },
  {
    title: 'Parbot indexes and keeps it fresh',
    body: 'Each passage is embedded and stored with its heading path. When the docs change, re-index from Knowledge: unchanged pages are skipped, removed pages are dropped, and the next question uses the new content.',
    detail: '142 pages · 1,318 passages · indexed 2 min ago',
  },
  {
    title: 'Readers get cited answers',
    body: 'A question pulls the passages closest to it, and only those go to the model. The answer streams in with numbered markers pointing at the passages it came from.',
    detail: '[1] Guide › Authentication › API keys',
  },
] as const;

export const HowItWorks = () => (
  <Section id="how-it-works" className="bg-card/40 border-t">
    <Container className="flex flex-col gap-12">
      <Reveal>
        <SectionHeading
          id="how-it-works"
          eyebrow="How it works"
          title="From a URL to answers in three steps."
          lede="No plugins, no framework requirement, nothing to train. Parbot only ever answers from what it indexed."
        />
      </Reveal>

      <ol className="grid gap-6 md:grid-cols-3">
        {STEPS.map((step, position) => (
          <Reveal
            key={step.title}
            as="li"
            delay={position * 90}
            className="bg-card ring-foreground/10 flex min-w-0 flex-col gap-4 rounded-xl p-6 ring-1"
          >
            <span className="bg-primary/15 text-primary flex size-8 items-center justify-center rounded-md font-mono text-sm font-semibold">
              {position + 1}
            </span>
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
            </div>
            <p className="bg-muted text-muted-foreground mt-auto break-words rounded-md px-3 py-2 font-mono text-xs">
              {step.detail}
            </p>
          </Reveal>
        ))}
      </ol>
    </Container>
  </Section>
);
