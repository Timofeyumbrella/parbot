'use client';

import { cn } from 'cn';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Reveal } from '@/components/marketing/reveal';
import { Container, Section, SectionHeading } from '@/components/marketing/section';
import { Button } from '@/components/ui/button';
import { formatPrice, type Plan } from '@/lib/plans';

export type BillingInterval = 'monthly' | 'yearly';

const INTERVALS: { id: BillingInterval; label: string; note?: string }[] = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly', note: '2 months free' },
];

const PlanCard = ({ plan, interval }: { plan: Plan; interval: BillingInterval }) => {
  const free = plan.monthlyCents === 0;
  const cents = interval === 'monthly' ? plan.monthlyCents : plan.yearlyCents;
  const caption = free
    ? 'No card needed.'
    : interval === 'monthly'
      ? 'Billed monthly. Cancel any time.'
      : 'Billed once a year. Twelve months for the price of ten.';

  return (
    <article
      data-testid={`plan-${plan.id}`}
      aria-labelledby={`plan-${plan.id}-name`}
      className={cn(
        'bg-card relative flex h-full flex-col gap-6 rounded-xl p-6 ring-1',
        plan.featured ? 'ring-primary shadow-primary/10 shadow-xl ring-2' : 'ring-foreground/10',
      )}
    >
      {plan.featured ? (
        <span className="bg-primary text-primary-foreground absolute -top-3 left-6 rounded-full px-2.5 py-0.5 text-xs font-medium">
          Recommended
        </span>
      ) : null}

      <div className="flex flex-col gap-1">
        <h3 id={`plan-${plan.id}-name`} className="text-lg font-semibold">
          {plan.name}
        </h3>
        <p className="text-muted-foreground text-sm leading-relaxed">{plan.tagline}</p>
      </div>

      <div className="flex flex-col gap-1">
        <p className="flex items-baseline gap-1">
          <span className="text-4xl font-semibold tracking-tight" data-testid="plan-price">
            {formatPrice(cents)}
          </span>
          {!free ? (
            <span className="text-muted-foreground text-sm">
              /{interval === 'monthly' ? 'month' : 'year'}
            </span>
          ) : null}
        </p>
        <p className="text-muted-foreground text-xs">{caption}</p>
      </div>

      <Button asChild variant={plan.featured ? 'default' : 'outline'} size="lg">
        <Link href={`/signup?plan=${plan.id}&interval=${interval}`}>
          {free ? 'Start free' : `Choose ${plan.name}`}
        </Link>
      </Button>

      <ul className="flex flex-col gap-2.5 text-sm">
        {plan.highlights.map((highlight) => (
          <li key={highlight} className="flex gap-2.5">
            <Check className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{highlight}</span>
          </li>
        ))}
      </ul>
    </article>
  );
};

/** Three plans from lib/plans with a monthly/yearly toggle. Numbers are never typed here. */
export const Pricing = ({ plans }: { plans: Plan[] }) => {
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  return (
    <Section id="pricing" className="bg-card/40 border-t">
      <Container className="flex flex-col gap-10">
        <Reveal>
          <SectionHeading
            id="pricing"
            align="center"
            eyebrow="Pricing"
            title="Starts at free. Grows with your docs."
            lede="Pay for the size of your documentation and the questions you answer. Yearly billing is twelve months for the price of ten."
          />
        </Reveal>

        <Reveal className="flex justify-center">
          <div
            role="group"
            aria-label="Billing interval"
            className="bg-muted inline-flex rounded-lg p-1"
          >
            {INTERVALS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={interval === option.id}
                onClick={() => setInterval(option.id)}
                className={cn(
                  'focus-visible:ring-ring/50 focus-visible:ring-3 flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium outline-none transition-colors',
                  interval === option.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
                {option.note ? <span className="text-primary text-xs">{option.note}</span> : null}
              </button>
            ))}
          </div>
        </Reveal>

        <ul className="grid items-start gap-4 pt-2 lg:grid-cols-3" aria-label="Plans">
          {plans.map((plan, position) => (
            <Reveal key={plan.id} as="li" delay={position * 90} className="h-full min-w-0">
              <PlanCard plan={plan} interval={interval} />
            </Reveal>
          ))}
        </ul>

        <Reveal>
          <p className="text-muted-foreground mx-auto max-w-2xl text-center text-sm leading-relaxed">
            Every plan includes streamed answers with citations, the conversation inbox and the
            bubble widget. Limits are per account, shared across its assistants. Prices are in US
            dollars.
          </p>
        </Reveal>
      </Container>
    </Section>
  );
};
