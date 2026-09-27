import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LeadsSummary, type LeadsSummaryProps } from './leads-summary';

const ASSISTANT = 'asst-1';

const props = (overrides: Partial<LeadsSummaryProps> = {}): LeadsSummaryProps => ({
  assistantId: ASSISTANT,
  days: 7,
  leads: 3,
  newLeads: 2,
  leadCapture: true,
  planAllowsLeads: true,
  ...overrides,
});

describe('LeadsSummary', () => {
  it('counts the period’s leads, the ones still waiting, and links to the Leads tab', () => {
    render(<LeadsSummary {...props()} />);

    expect(screen.getByTestId('leads-count')).toHaveTextContent('3');
    expect(screen.getByText('in the last 7 days')).toBeInTheDocument();
    expect(screen.getByTestId('leads-caption')).toHaveTextContent('2 not contacted yet.');
    expect(screen.getByRole('link', { name: /Open leads/ })).toHaveAttribute(
      'href',
      `/a/${ASSISTANT}/inbox?tab=leads`,
    );
  });

  it('notes when every lead has been contacted', () => {
    render(<LeadsSummary {...props({ newLeads: 0 })} />);

    expect(screen.getByTestId('leads-caption')).toHaveTextContent('All of them contacted.');
  });

  it('points to the widget settings when lead capture is off', () => {
    render(<LeadsSummary {...props({ leads: 0, newLeads: 0, leadCapture: false })} />);

    expect(screen.getByTestId('leads-caption')).toHaveTextContent('Lead capture is off');
    expect(screen.getByRole('link', { name: /Turn on lead capture/ })).toHaveAttribute(
      'href',
      `/a/${ASSISTANT}/widget`,
    );
  });

  it('points to Billing when the plan has no lead capture', () => {
    render(
      <LeadsSummary
        {...props({ leads: 0, newLeads: 0, leadCapture: false, planAllowsLeads: false })}
      />,
    );

    expect(screen.getByRole('link', { name: /Lead capture comes with Starter/ })).toHaveAttribute(
      'href',
      '/billing',
    );
  });
});
