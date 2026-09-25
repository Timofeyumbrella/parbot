import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AccountPlan } from '@/lib/account';
import { PLANS } from '@/lib/plans';

import { CurrentPlanCard, renewalLine } from './current-plan-card';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const account = (overrides: Partial<AccountPlan> = {}): AccountPlan => ({
  plan: PLANS.hobby,
  status: 'active',
  billingInterval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasStripeCustomer: false,
  ...overrides,
});

const starter = account({
  plan: PLANS.starter,
  billingInterval: 'yearly',
  currentPeriodEnd: '2026-11-02T10:00:00.000Z',
  hasStripeCustomer: true,
});

describe('renewalLine', () => {
  it('says what happens next for each state', () => {
    expect(renewalLine(account())).toMatch(/Choose a plan below/);
    expect(renewalLine(starter)).toBe('Renews on 2 November 2026.');
    expect(renewalLine({ ...starter, cancelAtPeriodEnd: true })).toBe(
      'Ends on 2 November 2026. You keep the plan until then.',
    );
    expect(renewalLine({ ...starter, status: 'past_due' })).toMatch(/payment failed/);
    expect(renewalLine({ ...starter, status: 'trialing' })).toBe('Trial ends on 2 November 2026.');
    expect(renewalLine({ ...account(), status: 'canceled' })).toMatch(/ended/);
  });

  it('explains why an unpaid first payment leaves the account on Hobby', () => {
    const unpaid = account({ status: 'incomplete', hasStripeCustomer: true });

    expect(renewalLine(unpaid)).toBe(
      'The first payment has not gone through yet, so you are on Hobby. Finish it in the portal.',
    );
  });
});

describe('CurrentPlanCard', () => {
  it('shows the plan, its price and interval, and the renewal date', () => {
    render(<CurrentPlanCard account={starter} providerName="stripe" />);

    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('$290 a year')).toBeInTheDocument();
    expect(screen.getByText('Renews on 2 November 2026.')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage subscription' })).toBeEnabled();
  });

  it('hides the portal button on Stripe until there is a customer', () => {
    render(<CurrentPlanCard account={account()} providerName="stripe" />);

    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage subscription' })).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing to manage yet/)).toBeInTheDocument();
  });

  it('always offers the test-mode portal on the mock provider', () => {
    render(<CurrentPlanCard account={account()} providerName="mock" />);

    expect(screen.getByRole('button', { name: 'Manage subscription' })).toBeEnabled();
  });

  it('marks a past due subscription', () => {
    render(<CurrentPlanCard account={{ ...starter, status: 'past_due' }} providerName="stripe" />);

    expect(screen.getByText('Past due')).toBeInTheDocument();
  });

  it('shows Hobby with a pending payment while the first payment is incomplete', () => {
    render(
      <CurrentPlanCard
        account={account({ status: 'incomplete', hasStripeCustomer: true })}
        providerName="stripe"
      />,
    );

    expect(screen.getByText('Hobby')).toBeInTheDocument();
    expect(screen.getByText('Payment pending')).toBeInTheDocument();
    expect(screen.getByText(/so you are on Hobby/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage subscription' })).toBeEnabled();
  });
});
