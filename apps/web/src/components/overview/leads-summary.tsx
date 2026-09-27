import { inboxHref } from '@/lib/analytics';
import { formatCount } from '@/lib/format';

import { NextStep, Section } from './section';

export type LeadsSummaryProps = {
  assistantId: string;
  days: number;
  leads: number;
  /** Leads from the period still marked new, that nobody has contacted yet. */
  newLeads: number;
  /** Whether the widget asks for an email when the docs fall short. */
  leadCapture: boolean;
  /** Whether the plan includes lead capture at all. */
  planAllowsLeads: boolean;
};

/** Readers who left an email when the docs fell short, and how many still wait for a reply. */
export const LeadsSummary = ({
  assistantId,
  days,
  leads,
  newLeads,
  leadCapture,
  planAllowsLeads,
}: LeadsSummaryProps) => (
  <Section
    testId="leads-summary"
    title="Leads"
    why="Readers who left an email when the docs fell short. Each one is waiting for a reply."
    footer={
      leads > 0 || leadCapture ? (
        <NextStep href={inboxHref(assistantId, 'leads')}>Open leads</NextStep>
      ) : planAllowsLeads ? (
        <NextStep href={`/a/${assistantId}/widget`}>Turn on lead capture</NextStep>
      ) : (
        <NextStep href="/billing">Lead capture comes with Starter and Growth</NextStep>
      )
    }
  >
    <div className="px-(--card-spacing) flex flex-col gap-1 py-4">
      <p className="text-sm">
        <span className="text-2xl font-semibold tracking-tight" data-testid="leads-count">
          {formatCount(leads)}
        </span>{' '}
        <span className="text-muted-foreground">in the last {days} days</span>
      </p>
      <p className="text-muted-foreground text-xs" data-testid="leads-caption">
        {leads > 0
          ? newLeads > 0
            ? `${formatCount(newLeads)} not contacted yet.`
            : 'All of them contacted.'
          : leadCapture
            ? 'Lead capture is on. Emails show here when readers leave one.'
            : 'Lead capture is off, so the widget does not ask for an email.'}
      </p>
    </div>
  </Section>
);
