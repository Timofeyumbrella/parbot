// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { idleState } from '@/lib/form';

import { updateEmail, updatePassword, updateProfile } from './account';

const { revalidatePath, requireUser, updateUser, profileUpdate } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireUser: vi.fn(),
  updateUser: vi.fn(),
  profileUpdate: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/session', () => ({ requireUser }));

const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'ada@example.com' };

const form = (fields: Record<string, string>) => {
  const data = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }

  return data;
};

describe('account actions', () => {
  beforeEach(() => {
    updateUser.mockResolvedValue({ data: { user: USER }, error: null });
    profileUpdate.mockResolvedValue({ error: null });
    requireUser.mockResolvedValue({
      user: USER,
      supabase: {
        auth: { updateUser },
        from: () => ({ update: (values: unknown) => ({ eq: (column: string, id: string) => profileUpdate(values, column, id) }) }),
      },
    });
  });

  it('checks every form before asking for the session', async () => {
    await expect(updateProfile(idleState, form({ fullName: '  ' }))).resolves.toMatchObject({
      status: 'error',
      fieldErrors: { fullName: 'Enter your name.' },
    });
    await expect(updateEmail(idleState, form({ email: 'not-an-email' }))).resolves.toMatchObject({
      fieldErrors: { email: 'Enter a valid email address.' },
    });

    const password = await updatePassword(idleState, form({ password: 'long enough pass', confirmPassword: 'something else' }));

    expect(password).toMatchObject({ fieldErrors: { confirmPassword: 'The two passwords differ.' } });
    // Passwords are never sent back to refill the form.
    expect(password.values).toEqual({});
    expect(requireUser).not.toHaveBeenCalled();
  });

  it('saves the name in auth and on the profile, then refreshes the page', async () => {
    const result = await updateProfile(idleState, form({ fullName: '  Ada Lovelace ' }));

    expect(result).toEqual({ status: 'success', message: 'Name saved.', values: { fullName: 'Ada Lovelace' } });
    expect(updateUser).toHaveBeenCalledWith({ data: { full_name: 'Ada Lovelace' } });
    expect(profileUpdate).toHaveBeenCalledWith({ full_name: 'Ada Lovelace' }, 'id', USER.id);
    expect(revalidatePath).toHaveBeenCalledWith('/account');
  });

  it('keeps what was typed and says what happened when saving fails', async () => {
    profileUpdate.mockResolvedValue({ error: { message: 'permission denied' } });

    await expect(updateProfile(idleState, form({ fullName: 'Ada' }))).resolves.toEqual({
      status: 'error',
      values: { fullName: 'Ada' },
      error: 'Your name could not be saved. Try again.',
    });

    updateUser.mockResolvedValue({ data: { user: null }, error: { code: 'same_password', message: 'New password should be different' } });

    await expect(updatePassword(idleState, form({ password: 'long enough pass', confirmPassword: 'long enough pass' }))).resolves.toEqual({
      status: 'error',
      error: 'Choose a password that differs from the current one.',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses the current address and explains a change that waits for confirmation', async () => {
    await expect(updateEmail(idleState, form({ email: 'ADA@example.com' }))).resolves.toMatchObject({
      status: 'error',
      fieldErrors: { email: 'That is already your email address.' },
    });
    expect(updateUser).not.toHaveBeenCalled();

    const pending = await updateEmail(idleState, form({ email: 'ada@newco.example' }));

    expect(pending).toEqual({
      status: 'success',
      message: 'Confirmation links went to ada@example.com and ada@newco.example. The change applies once you open both.',
      values: { email: 'ada@newco.example' },
    });
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it('writes the profile at once when auth applied the new address', async () => {
    updateUser.mockResolvedValue({ data: { user: { ...USER, email: 'ada@newco.example' } }, error: null });

    await expect(updateEmail(idleState, form({ email: 'ada@newco.example' }))).resolves.toMatchObject({
      status: 'success',
      message: 'Email updated.',
    });
    expect(profileUpdate).toHaveBeenCalledWith({ email: 'ada@newco.example' }, 'id', USER.id);
  });
});
