import { ChevronDown } from 'lucide-react';

import { Reveal } from '@/components/marketing/reveal';
import { Container, Section, SectionHeading } from '@/components/marketing/section';
import { PLAN_ORDER, PLANS } from '@/lib/plans';

const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

const paidPlans = joinNames(PLAN_ORDER.filter((id) => PLANS[id].leadCapture).map((id) => PLANS[id].name));
const themedPlans = joinNames(PLAN_ORDER.filter((id) => PLANS[id].customTheme).map((id) => PLANS[id].name));
const hobby = PLANS.hobby;
const number = (value: number) => value.toLocaleString('en-US');

export const FAQ_ITEMS = [
  {
    question: 'What documentation can Parbot index?',
    answer:
      'A public URL or a sitemap, uploaded PDF, Word, Markdown or plain-text files, or text you paste in. Each source is split into passages, so an answer can point back to the exact place it came from.',
  },
  {
    question: 'How fresh are the answers?',
    answer:
      'As fresh as the last index. Every source shows when it was indexed. Re-index it from the Knowledge screen whenever the docs change and the next question uses the new content. Nothing on your site needs redeploying.',
  },
  {
    question: 'Does it make things up?',
    answer:
      'It is instructed to answer only from the passages retrieved for the question and to cite them by number. When nothing relevant is found, or the model cannot answer from what was found, Parbot says the docs do not cover it rather than guessing. The citations are there so readers can check.',
  },
  {
    question: 'What happens when it cannot answer?',
    answer: `The reader gets a plain reply saying the documentation does not cover the question. On ${paidPlans} the widget can then ask for their email so you can follow up. Either way the conversation is marked unanswered in your inbox, which is the most useful list a docs team can have.`,
  },
  {
    question: 'Can I style it?',
    answer: `On ${themedPlans}: pick the accent colour, a light, dark or automatic scheme, the corner radius and which side the launcher sits on, and choose between the bubble and the ⌘K palette. ${hobby.name} uses the default theme in bubble mode. Paid plans can also remove the Parbot branding. The widget renders inside a Shadow DOM, so your stylesheet and ours stay out of each other's way.`,
  },
  {
    question: 'Is there a free plan?',
    answer: `Yes. ${hobby.name} is free with no card: ${number(hobby.assistants)} assistant, ${number(hobby.pages)} indexed pages and ${number(hobby.messagesPerMonth)} answers a month with the bubble widget. Upgrade when you need more assistants, more pages, the palette or lead capture.`,
  },
];

export const Faq = () => (
  <Section id="faq" className="border-t">
    <Container className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
      <Reveal>
        <SectionHeading
          id="faq"
          eyebrow="FAQ"
          title="Questions teams ask before they add it."
          lede="Short answers. Anything else, ask the assistant on this page or write to us after you sign up."
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
