import { Globe, Inbox, type LucideIcon, MessageSquareWarning, Palette, Quote, Zap } from 'lucide-react';

import { Reveal } from '@/components/marketing/reveal';
import { Container, Section, SectionHeading } from '@/components/marketing/section';

type Feature = { icon: LucideIcon; title: string; body: string };

const FEATURES: Feature[] = [
  {
    icon: Zap,
    title: 'Streams the answer',
    body: 'Words appear as the model writes them, so readers start reading before the answer is finished instead of watching a spinner.',
  },
  {
    icon: Quote,
    title: 'Cites the page',
    body: 'Every answer carries numbered citations that link to the page and passage it was drawn from. Readers can check, and usually do.',
  },
  {
    icon: MessageSquareWarning,
    title: 'Admits what it does not know',
    body: 'When the docs do not cover a question, Parbot says so rather than guessing. On paid plans it can ask for an email so your team can follow up.',
  },
  {
    icon: Inbox,
    title: 'An inbox for every conversation',
    body: 'Read each conversation, see the questions asked most and the ones that went unanswered. That list is your documentation backlog.',
  },
  {
    icon: Palette,
    title: 'Theme and mode per assistant',
    body: 'Accent colour, light or dark, corner radius, position, bubble or palette. Set per assistant and applied on the next page load.',
  },
  {
    icon: Globe,
    title: 'Works on any site',
    body: 'One script tag with no framework requirement. Shadow DOM keeps your styles and ours apart, and you can restrict it to your own domains.',
  },
];

export const Features = () => (
  <Section id="features" className="border-t">
    <Container className="flex flex-col gap-12">
      <Reveal>
        <SectionHeading
          id="features"
          eyebrow="What you get"
          title="Built for docs, not for chat."
          lede="Everything a documentation assistant needs to be trusted by readers and useful to the team behind it."
        />
      </Reveal>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, position) => (
          <Reveal key={feature.title} delay={(position % 3) * 80}>
            <li className="bg-card ring-foreground/10 flex h-full flex-col gap-3 rounded-xl p-6 ring-1">
              <span className="bg-primary/15 text-primary flex size-9 items-center justify-center rounded-md">
                <feature.icon className="size-4.5" aria-hidden="true" />
              </span>
              <h3 className="text-base font-semibold">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.body}</p>
            </li>
          </Reveal>
        ))}
      </ul>
    </Container>
  </Section>
);
