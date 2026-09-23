import { beforeEach, describe, expect, it, vi } from 'vitest';

import { signIn, signUp } from './auth';

const { auth, redirect } = vi.hoisted(() => ({
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  },
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth })),
}));
vi.mock('next/navigation', () => ({ redirect }));

const form = (entries: Record<string, string>) => {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }

  return data;
};

const idle = { status: 'idle' as const };

beforeEach(() => {
  auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
  auth.signUp.mockResolvedValue({ data: { session: { access_token: 'x' }, user: { id: '1' } }, error: null });
});

describe('signIn', () => {
  it('goes to the dashboard by default', async () => {
    await expect(signIn(idle, form({ email: 'ada@example.com', password: 'secret-1' }))).rejects.toThrow(
      'REDIRECT /dashboard',
    );
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'secret-1' });
  });

  it('honours a relative next path and ignores an absolute one', async () => {
    await expect(
      signIn(idle, form({ email: 'ada@example.com', password: 'secret-1', next: '/a/1/inbox?tab=leads' })),
    ).rejects.toThrow('REDIRECT /a/1/inbox?tab=leads');

    await expect(
      signIn(idle, form({ email: 'ada@example.com', password: 'secret-1', next: '//evil.com/x' })),
    ).rejects.toThrow('REDIRECT /dashboard');
  });

  it('reports a wrong password without echoing it back', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });

    const state = await signIn(idle, form({ email: 'ada@example.com', password: 'wrong' }));

    expect(state).toEqual({
      status: 'error',
      error: 'Wrong email or password.',
      values: { email: 'ada@example.com', next: '' },
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('validates before calling auth', async () => {
    const state = await signIn(idle, form({ email: 'nope', password: '' }));

    expect(state.fieldErrors).toEqual({ email: 'Enter a valid email address.', password: 'Enter your password.' });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('signUp', () => {
  it('stores the name in user metadata and lands on onboarding with the plan', async () => {
    await expect(
      signUp(
        idle,
        form({ fullName: ' Ada Lovelace ', email: 'Ada@Example.com', password: 'correct horse', plan: 'starter', interval: 'yearly' }),
      ),
    ).rejects.toThrow('REDIRECT /onboarding?plan=starter&interval=yearly');

    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'correct horse',
      options: { data: { full_name: 'Ada Lovelace' } },
    });
  });

  it('drops a plan it does not know', async () => {
    await expect(
      signUp(idle, form({ fullName: 'Ada', email: 'ada@example.com', password: 'correct horse', plan: 'gold' })),
    ).rejects.toThrow('REDIRECT /onboarding');
  });

  it('explains an existing email and a weak password inline', async () => {
    auth.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: 'user_already_exists', message: 'User already registered' },
    });

    const existing = await signUp(idle, form({ fullName: 'Ada', email: 'ada@example.com', password: 'correct horse' }));

    expect(existing.error).toBe('An account with this email already exists. Sign in instead.');
    expect(existing.values).toEqual({ fullName: 'Ada', email: 'ada@example.com', plan: '', interval: '' });

    const weak = await signUp(idle, form({ fullName: 'Ada', email: 'ada@example.com', password: 'short' }));

    expect(weak.fieldErrors).toEqual({ password: 'Use at least 8 characters.' });
  });

  it('asks the visitor to confirm when no session comes back', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { id: '1' } }, error: null });

    const state = await signUp(idle, form({ fullName: 'Ada', email: 'ada@example.com', password: 'correct horse' }));

    expect(state.status).toBe('success');
    expect(state.message).toMatch(/confirmation link to ada@example.com/);
    expect(redirect).not.toHaveBeenCalled();
  });
});
