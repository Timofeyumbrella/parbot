import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateLeadStatus: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/actions/leads', () => ({ updateLeadStatus: mocks.updateLeadStatus }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

import { LeadsTable, type LeadRow, OFFLINE_ERROR } from './leads-table';

const NOW = new Date('2026-09-23T12:00:00Z').getTime();

const lead: LeadRow = {
  id: '6f0a2c1e-6d5f-4d1e-9c21-3a1b0c2d3e4f',
  email: 'ada@example.com',
  note: 'Does it support SSO?',
  page_url: 'https://docs.example.com/security',
  status: 'new',
  created_at: '2026-09-23T11:30:00Z',
  conversation_id: 'c1',
};

// Radix Select relies on pointer capture, which jsdom does not implement.
beforeEach(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.setPointerCapture ??= () => {};
});

const pick = async (option: string) => {
  const user = userEvent.setup();
  const trigger = screen.getByRole('combobox', { name: 'Status of ada@example.com' });

  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: option }));

  return trigger;
};

describe('LeadsTable', () => {
  it('shows the lead with a mailto link, the page host, the time and the conversation link', () => {
    render(<LeadsTable rows={[lead]} assistantId="a1" now={NOW} />);

    const table = screen.getByTestId('leads-table');
    expect(within(table).getByRole('link', { name: 'ada@example.com' })).toHaveAttribute(
      'href',
      'mailto:ada@example.com',
    );
    expect(within(table).getByRole('link', { name: 'docs.example.com' })).toHaveAttribute(
      'href',
      lead.page_url,
    );
    expect(within(table).getByText('Does it support SSO?')).toBeInTheDocument();
    expect(within(table).getByText('30 min ago')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/a/a1/inbox/c1',
    );
    expect(screen.getByRole('combobox', { name: 'Status of ada@example.com' })).toHaveTextContent(
      'New',
    );
  });

  it('saves a new status through the action and keeps it', async () => {
    mocks.updateLeadStatus.mockResolvedValue({ ok: true, status: 'contacted' });
    render(<LeadsTable rows={[lead]} assistantId="a1" now={NOW} />);

    const trigger = await pick('Contacted');

    await waitFor(() => expect(trigger).toHaveTextContent('Contacted'));
    expect(mocks.updateLeadStatus).toHaveBeenCalledWith({ leadId: lead.id, status: 'contacted' });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('rolls back and toasts when the action reports an error', async () => {
    mocks.updateLeadStatus.mockResolvedValue({ ok: false, error: 'That lead no longer exists.' });
    render(<LeadsTable rows={[lead]} assistantId="a1" now={NOW} />);

    const trigger = await pick('Closed');

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('That lead no longer exists.'),
    );
    await waitFor(() => expect(trigger).toHaveTextContent('New'));
  });

  it('rolls back and toasts when the request itself fails, without throwing', async () => {
    mocks.updateLeadStatus.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<LeadsTable rows={[lead]} assistantId="a1" now={NOW} />);

    const trigger = await pick('Closed');

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(OFFLINE_ERROR));
    await waitFor(() => expect(trigger).toHaveTextContent('New'));
  });

  it('points an empty inbox at the Widget screen and names the plans', () => {
    render(<LeadsTable rows={[]} assistantId="a1" now={NOW} />);

    expect(screen.getByText('No leads yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Widget screen' })).toHaveAttribute(
      'href',
      '/a/a1/widget',
    );
    expect(screen.getByText(/Starter and Growth/)).toBeInTheDocument();
  });
});
