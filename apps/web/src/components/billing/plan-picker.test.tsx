import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanPicker, type PlanPickerProps } from './plan-picker';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const baseProps: PlanPickerProps = {
  currentPlanId: 'hobby',
  currentInterval: null,
  currentStatus: 'active',
  hasStripeCustomer: false,
  providerName: 'mock',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('PlanPicker', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(cleanup);

  it('shows the three plans with the current one marked', () => {
    render(<PlanPicker {...baseProps} />);

    const hobby = screen.getByTestId('plan-hobby');
    const starter = screen.getByTestId('plan-starter');
    const growth = screen.getByTestId('plan-growth');

    expect(within(hobby).getByRole('button', { name: 'Current plan' })).toBeDisabled();
    expect(within(hobby).getByText('Current')).toBeInTheDocument();
    expect(within(starter).getByRole('button', { name: 'Choose Starter' })).toBeEnabled();
    expect(within(growth).getByRole('button', { name: 'Choose Growth' })).toBeEnabled();
    expect(starter).toHaveAttribute('data-featured', 'true');
    expect(within(starter).getByText('$29')).toBeInTheDocument();
    expect(within(growth).getByText('$99')).toBeInTheDocument();
  });

  it('switches to yearly prices and shows the two months free', async () => {
    const user = userEvent.setup();
    render(<PlanPicker {...baseProps} />);

    await user.click(screen.getByRole('tab', { name: 'Yearly' }));

    const starter = screen.getByTestId('plan-starter');
    expect(within(starter).getByText('$290')).toBeInTheDocument();
    expect(within(starter).getByText(/Two months free/)).toBeInTheDocument();
    expect(within(screen.getByTestId('plan-growth')).getByText('$990')).toBeInTheDocument();
  });

  it('posts the choice and follows the URL that comes back', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ url: 'http://localhost:3000/billing?mock_plan=starter&mock_interval=yearly' }));
    render(<PlanPicker {...baseProps} />);

    await user.click(screen.getByRole('tab', { name: 'Yearly' }));
    await user.click(screen.getByRole('button', { name: 'Choose Starter' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/billing/checkout',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ planId: 'starter', interval: 'yearly' }) }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/billing?mock_plan=starter&mock_interval=yearly'));
  });

  it('shows the server error when checkout cannot start', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'Stripe is having a moment.' }, 502));
    render(<PlanPicker {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Choose Growth' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Stripe is having a moment.');
    expect(screen.getByRole('button', { name: 'Choose Growth' })).toBeEnabled();
  });

  it('sends a paid account to the portal for Hobby', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ url: 'http://localhost:3000/billing?mock_portal=1' }));
    render(<PlanPicker {...baseProps} currentPlanId="starter" currentInterval="monthly" />);

    expect(within(screen.getByTestId('plan-starter')).getByRole('button', { name: 'Current plan' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Switch to Hobby' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/billing/portal', expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/billing?mock_portal=1'));
  });

  it('routes plan changes through the portal for a live Stripe subscription', () => {
    render(
      <PlanPicker {...baseProps} providerName="stripe" hasStripeCustomer currentPlanId="starter" currentInterval="monthly" />,
    );

    expect(screen.getByRole('button', { name: 'Change to Growth in portal' })).toBeEnabled();
  });

  it('preselects the plan carried from signup and scrolls to it', () => {
    render(<PlanPicker {...baseProps} preselect={{ planId: 'growth', interval: 'yearly' }} />);

    expect(screen.getByRole('tab', { name: 'Yearly' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('plan-growth')).toHaveClass('ring-primary');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
