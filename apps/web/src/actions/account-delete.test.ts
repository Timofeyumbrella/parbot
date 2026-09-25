import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PLANS } from '@/lib/plans';

import { deleteAccount } from './account';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const EMAIL = 'owner@example.com';

const { getAccountPlan, redirect, requireUser, removeStoredFiles, deleteUser, signOut } =
  vi.hoisted(() => ({
    getAccountPlan: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`REDIRECT ${url}`);
    }),
    requireUser: vi.fn(),
    removeStoredFiles: vi.fn(),
    deleteUser: vi.fn(),
    signOut: vi.fn(),
  }));

const service = { auth: { admin: { deleteUser } } };

vi.mock('@/lib/account', () => ({ getAccountPlan }));
vi.mock('@/lib/session', () => ({ requireUser }));
vi.mock('@/lib/source-files', () => ({ removeStoredFiles }));
vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: () => service }));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const form = (confirmEmail: string) => {
  const data = new FormData();

  data.set('confirmEmail', confirmEmail);

  return data;
};

const idle = { status: 'idle' as const };
const hobby = { plan: PLANS.hobby, status: 'active', cancelAtPeriodEnd: false };

beforeEach(() => {
  requireUser.mockResolvedValue({
    supabase: { auth: { signOut } },
    user: { id: USER_ID, email: EMAIL },
  });
  getAccountPlan.mockResolvedValue(hobby);
  removeStoredFiles.mockResolvedValue([]);
  deleteUser.mockResolvedValue({ data: {}, error: null });
  signOut.mockResolvedValue({ error: null });
});

describe('deleteAccount', () => {
  it('requires the typed email to match before it touches anything', async () => {
    const state = await deleteAccount(idle, form('someone-else@example.com'));

    expect(state.fieldErrors).toEqual({ confirmEmail: `Type ${EMAIL} exactly as shown.` });
    expect(removeStoredFiles).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('refuses while a paid plan is still running', async () => {
    getAccountPlan.mockResolvedValue({
      plan: PLANS.starter,
      status: 'active',
      cancelAtPeriodEnd: false,
    });

    const state = await deleteAccount(idle, form(EMAIL));

    expect(state).toMatchObject({
      status: 'error',
      error: expect.stringMatching(/Starter plan is still running/),
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('lets a cancelled paid plan through', async () => {
    getAccountPlan.mockResolvedValue({
      plan: PLANS.starter,
      status: 'active',
      cancelAtPeriodEnd: true,
    });

    await expect(deleteAccount(idle, form(EMAIL))).rejects.toThrow('REDIRECT /login?deleted=1');
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it('removes the whole folder of files, deletes the auth user, signs out locally and leaves', async () => {
    let deletedBeforeFiles = false;
    removeStoredFiles.mockImplementation(async () => {
      deletedBeforeFiles = deleteUser.mock.calls.length > 0;

      return [`${USER_ID}/a/one.md`];
    });

    await expect(deleteAccount(idle, form(` ${EMAIL.toUpperCase()} `))).rejects.toThrow(
      'REDIRECT /login?deleted=1',
    );

    expect(removeStoredFiles).toHaveBeenCalledWith(service, USER_ID);
    expect(deletedBeforeFiles).toBe(false);
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('keeps the account when the files could not be removed', async () => {
    removeStoredFiles.mockRejectedValue(new Error('storage is down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const state = await deleteAccount(idle, form(EMAIL));

    expect(state).toMatchObject({
      status: 'error',
      error: expect.stringMatching(/files could not be removed/),
    });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('explains an auth failure instead of throwing', async () => {
    deleteUser.mockResolvedValue({ data: {}, error: { message: 'nope' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const state = await deleteAccount(idle, form(EMAIL));

    expect(state).toMatchObject({
      status: 'error',
      error: 'The account could not be deleted. Try again in a moment.',
    });
    expect(signOut).not.toHaveBeenCalled();
  });
});
