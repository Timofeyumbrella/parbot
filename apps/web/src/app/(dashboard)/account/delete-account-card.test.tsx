import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FormState } from '@/lib/form';

import { DeleteAccountCard } from './delete-account-card';

const { deleteAccount } = vi.hoisted(() => ({
  deleteAccount: vi.fn<(state: FormState, data: FormData) => Promise<FormState>>(),
}));

vi.mock('@/actions/account', () => ({ deleteAccount }));

afterEach(cleanup);

describe('DeleteAccountCard', () => {
  it('arms the button only once the email address is typed, then submits it', async () => {
    deleteAccount.mockResolvedValue({
      status: 'error',
      error:
        'Your Starter plan is still running. Cancel it on the billing page first, then delete the account.',
      values: { confirmEmail: 'owner@example.com' },
    });
    const user = userEvent.setup();

    render(<DeleteAccountCard email="owner@example.com" />);

    await user.click(screen.getByRole('button', { name: 'Delete account' }));

    const confirm = screen.getByRole('button', { name: 'Delete for good' });

    expect(confirm).toBeDisabled();

    await user.type(
      screen.getByLabelText('Type owner@example.com to confirm'),
      'Owner@Example.com',
    );
    expect(confirm).toBeEnabled();

    await user.click(confirm);

    expect(await screen.findByRole('alert')).toHaveTextContent('Starter plan is still running');
    expect(deleteAccount.mock.calls[0]?.[1].get('confirmEmail')).toBe('Owner@Example.com');
  });
});
