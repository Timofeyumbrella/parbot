import { Reveal } from '@/components/marketing/reveal';
import { Container, Section, SectionHeading } from '@/components/marketing/section';

const STEPS = [
  {
    title: 'Point it at your docs',
    body: 'Give Parbot a URL or a sitemap, or upload files. It crawls the pages, splits them into passages and embeds each one.',
    detail: 'https://docs.acme.dev/sitemap.xml',
  },
  {
    title: 'Parbot indexes and keeps it fresh',
    body: 'Every source shows what was indexed and when. Re-index from the Knowledge screen whenever the docs change; nothing needs to be redeployed.',
    detail: '142 pages · 1,318 passages · indexed 2 minutes ago',
  },
  {
    title: 'Readers get cited answers',
    body: 'Each question pulls the closest passages. The answer streams in with numbered markers that link back to the exact pages it came from.',
    detail: '[1] Authentication › API keys',
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
          <Reveal key={step.title} delay={position * 90}>
            <li className="bg-card ring-foreground/10 flex h-full flex-col gap-4 rounded-xl p-6 ring-1">
              <span className="bg-primary/15 text-primary flex size-8 items-center justify-center rounded-md font-mono text-sm font-semibold">
                {position + 1}
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
              </div>
              <p className="bg-muted text-muted-foreground mt-auto truncate rounded-md px-3 py-2 font-mono text-xs">
                {step.detail}
              </p>
            </li>
          </Reveal>
        ))}
      </ol>
    </Container>
  </Section>
);
