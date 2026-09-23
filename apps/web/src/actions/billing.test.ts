import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryStore } from '@/lib/billing/testing';

const ACCOUNT = '00000000-0000-4000-8000-000000000001';
const getSession = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const revalidatePath = vi.fn();
let memory = createMemoryStore([ACCOUNT]);

vi.mock('@/lib/session', () => ({ getSession: () => getSession() }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }));
vi.mock('@/lib/billing/store', () => ({ createSubscriptionStore: () => memory.store }));

vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
vi.stubEnv('BILLING_PROVIDER', 'mock');

const { applyMockPlan, switchToHobbyMock } = await import('./billing');

const form = (fields: Record<string, string>) => {
  const data = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }

  return data;
};

describe('applyMockPlan', () => {
  beforeEach(() => {
    memory = createMemoryStore([ACCOUNT]);
    getSession.mockResolvedValue({ user: { id: ACCOUNT, email: 'demo@parbot.dev' }, supabase: {} });
  });

  it('refuses a plan it does not know', async () => {
    await expect(applyMockPlan({}, form({ planId: 'hobby', interval: 'monthly' }))).resolves.toEqual({
      error: expect.stringMatching(/Starter or Growth/),
    });
    expect(memory.saves).toHaveLength(0);
  });

  it('refuses signed-out visitors', async () => {
    getSession.mockResolvedValue({ user: null, supabase: {} });

    await expect(applyMockPlan({}, form({ planId: 'starter', interval: 'monthly' }))).resolves.toEqual({
      error: expect.stringMatching(/Sign in/),
    });
    expect(memory.saves).toHaveLength(0);
  });

  it('writes an active plan that renews in 30 days, then goes to the success notice', async () => {
    const before = Date.now();

    await expect(applyMockPlan({}, form({ planId: 'growth', interval: 'yearly' }))).rejects.toThrow(
      'NEXT_REDIRECT:/billing?checkout=success',
    );

    expect(memory.saves).toHaveLength(1);
    expect(memory.saves[0]?.accountId).toBe(ACCOUNT);
    expect(memory.rows.get(ACCOUNT)).toMatchObject({
      plan_id: 'growth',
      billing_interval: 'yearly',
      status: 'active',
      cancel_at_period_end: false,
    });

    const periodEnd = new Date(memory.rows.get(ACCOUNT)?.current_period_end ?? '').getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(periodEnd - before).toBeGreaterThanOrEqual(thirtyDays - 5_000);
    expect(periodEnd - before).toBeLessThanOrEqual(thirtyDays + 5_000);
    expect(revalidatePath).toHaveBeenCalledWith('/billing');
  });

  it('reports a failed write instead of redirecting', async () => {
    memory.store.save = async () => {
      throw new Error('database away');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(applyMockPlan({}, form({ planId: 'starter', interval: 'monthly' }))).resolves.toEqual({
      error: expect.stringMatching(/could not be saved/),
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('switchToHobbyMock', () => {
  beforeEach(() => {
    memory = createMemoryStore([ACCOUNT]);
    getSession.mockResolvedValue({ user: { id: ACCOUNT, email: 'demo@parbot.dev' }, supabase: {} });
  });

  it('puts the account back on Hobby with no period end', async () => {
    await memory.store.save(ACCOUNT, { plan_id: 'starter', billing_interval: 'monthly', current_period_end: '2027-01-01T00:00:00Z' });

    await expect(switchToHobbyMock()).rejects.toThrow('NEXT_REDIRECT:/billing?checkout=success');

    expect(memory.rows.get(ACCOUNT)).toMatchObject({
      plan_id: 'hobby',
      billing_interval: null,
      status: 'active',
      current_period_end: null,
      cancel_at_period_end: false,
    });
  });
});
