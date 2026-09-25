import {
  Globe,
  Inbox,
  type LucideIcon,
  MessageSquareWarning,
  Palette,
  Quote,
  Zap,
} from 'lucide-react';

import { plansWith } from '@/components/marketing/plan-copy';
import { Reveal } from '@/components/marketing/reveal';
import { Container, Section, SectionHeading } from '@/components/marketing/section';

type Feature = { icon: LucideIcon; title: string; body: string };

export const FEATURES: Feature[] = [
  {
    icon: Zap,
    title: 'Streams the answer',
    body: 'The first word appears as soon as the model produces it. Readers start reading before the answer is finished instead of watching a spinner.',
  },
  {
    icon: Quote,
    title: 'Cites the page',
    body: 'Every answer carries numbered citations naming the page and passage it was drawn from, with a link whenever the source is a web page, so a reader can check it.',
  },
  {
    icon: MessageSquareWarning,
    title: 'Admits what it does not know',
    body: `When the docs do not cover a question, Parbot says so rather than guessing. On ${plansWith('leadCapture')} the widget can then ask for an email so your team can follow up.`,
  },
  {
    icon: Inbox,
    title: 'An inbox for every conversation',
    body: 'Every conversation from the widget and the in-app chat, with the questions asked most and the ones that went unanswered. That second list is your documentation backlog.',
  },
  {
    icon: Palette,
    title: 'Theme and mode per assistant',
    body: 'Accent colour, light or dark, corner radius, launcher position, bubble or palette. Set from the dashboard and picked up by installed widgets on their next load.',
  },
  {
    icon: Globe,
    title: 'Works on any site',
    body: 'One script tag with no framework requirement. Shadow DOM keeps your styles and ours apart, and you can restrict the widget to your own origins.',
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
          <Reveal
            key={feature.title}
            as="li"
            delay={(position % 3) * 80}
            className="bg-card ring-foreground/10 flex min-w-0 flex-col gap-3 rounded-xl p-6 ring-1"
          >
            <span className="bg-primary/15 text-primary flex size-9 items-center justify-center rounded-md">
              <feature.icon className="size-4.5" aria-hidden="true" />
            </span>
            <h3 className="text-base font-semibold">{feature.title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{feature.body}</p>
          </Reveal>
        ))}
      </ul>
    </Container>
  </Section>
);
