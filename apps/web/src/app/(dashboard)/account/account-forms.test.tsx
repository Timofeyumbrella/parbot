import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FormState } from '@/lib/form';

import { ProfileForm } from './account-forms';

const { updateProfile, toast } = vi.hoisted(() => ({
  updateProfile: vi.fn<(state: FormState, data: FormData) => Promise<FormState>>(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/actions/account', () => ({
  updateProfile,
  updateEmail: vi.fn(),
  updatePassword: vi.fn(),
}));
vi.mock('@/actions/auth', () => ({ signOut: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

afterEach(cleanup);

describe('ProfileForm', () => {
  it('shows the saved name after React resets the form, and a second save sends it again', async () => {
    // Like the action: the stored, trimmed name comes back.
    updateProfile.mockImplementation(async (_state, data) => ({
      status: 'success',
      message: 'Name saved.',
      values: { fullName: String(data.get('fullName')).trim() },
    }));
    const user = userEvent.setup();

    render(<ProfileForm fullName="Ada" />);

    const name = () => screen.getByLabelText('Full name');

    await user.clear(name());
    await user.type(name(), '  Ada Lovelace ');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));

    expect(name()).toHaveValue('Ada Lovelace');

    await user.click(screen.getByRole('button', { name: 'Save name' }));
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(2));

    expect(updateProfile.mock.calls[1]?.[1]?.get('fullName')).toBe('Ada Lovelace');
    expect(name()).toHaveValue('Ada Lovelace');
  });
});
