import { ChevronDown } from 'lucide-react';

import { formatCount, plansWith } from '@/components/marketing/plan-copy';
import { Reveal } from '@/components/marketing/reveal';
import { Container, Section, SectionHeading } from '@/components/marketing/section';
import { PLANS } from '@/lib/plans';

const hobby = PLANS.hobby;

export const FAQ_ITEMS = [
  {
    question: 'What documentation can Parbot index?',
    answer:
      'A public docs site or a sitemap, uploaded PDF, Word, Markdown, HTML or plain-text files, or text you paste in. Pages are fetched as a browser would, without running JavaScript, so sites that render everything client-side should hand Parbot a sitemap or exported files instead. Each source is split into passages, so an answer can point back to the exact place it came from.',
  },
  {
    question: 'How fresh are the answers?',
    answer:
      'As fresh as the last index. Every source shows when it was indexed. Re-index it from the Knowledge screen whenever the docs change: unchanged pages are skipped and the next question uses the new content. Nothing on your site needs redeploying. Parbot does not crawl on a schedule yet.',
  },
  {
    question: 'Does it make things up?',
    answer:
      'It is instructed to answer only from the passages retrieved for the question and to cite them by number. When nothing relevant is found, or the model cannot answer from what was found, Parbot says the docs do not cover it rather than guessing. No model is perfect, which is why the citations are always there for readers to check.',
  },
  {
    question: 'What happens when it cannot answer?',
    answer: `The reader gets a plain reply saying the documentation does not cover the question. On ${plansWith('leadCapture')} the widget can then ask for their email and a note so you can follow up. Either way the question is marked unanswered in your inbox, which is the most useful list a docs team can have.`,
  },
  {
    question: 'Can I style it?',
    answer: `On ${plansWith('customTheme')}: pick the accent colour, a light, dark or automatic scheme, the corner radius and which side the launcher sits on, and choose between the bubble and the ⌘K palette. ${hobby.name} uses the default theme in bubble mode. ${plansWith('hideBranding')} can also remove the Parbot branding. The widget renders inside a Shadow DOM, so your stylesheet and ours stay out of each other's way.`,
  },
  {
    question: 'Is there a free plan?',
    answer: `Yes. ${hobby.name} is free with no card: ${formatCount(hobby.assistants)} assistant, ${formatCount(hobby.pages)} indexed pages and ${formatCount(hobby.messagesPerMonth)} answers a month with the bubble widget. Upgrade when you need more assistants, more pages, the palette or lead capture.`,
  },
];

export const Faq = ({ demoKey }: { demoKey: string | null }) => (
  <Section id="faq" className="border-t">
    <Container className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
      <Reveal>
        <SectionHeading
          id="faq"
          eyebrow="FAQ"
          title="Questions teams ask before they add it."
          lede={
            demoKey
              ? 'Short answers. For anything else, press ⌘K and ask the assistant on this page.'
              : 'Short answers to what we hear most. The details live in the product docs once you are signed in.'
          }
        />
      </Reveal>

      <Reveal>
        <div className="divide-y border-y">
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <ChevronDown
                  className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">{item.answer}</p>
            </details>
          ))}
        </div>
      </Reveal>
    </Container>
  </Section>
);
