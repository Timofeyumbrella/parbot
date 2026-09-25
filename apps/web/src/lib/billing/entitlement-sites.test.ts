import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAccountPlan } from '@/lib/account';
import { loadOwnerPlan } from '@/lib/widget-api';
import { createFakeService, type FakeRow } from '@/lib/widget-api.fixtures';

// The sites that read a subscriptions row back into a plan. Each row below is one the webhook could
// have stored before the entitlement rule existed, so the paid plan_id is still on it: only the
// status may decide whether it counts.

const holder = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

vi.mock('@/lib/session', () => ({
  getSession: async () => ({
    supabase: createFakeService({ subscriptions: holder.rows }).client,
    user: { id: '00000000-0000-4000-8000-000000000001' },
  }),
}));

const OWNER = '00000000-0000-4000-8000-000000000001';

const row = (overrides: FakeRow): FakeRow => ({
  account_id: OWNER,
  plan_id: 'starter',
  status: 'active',
  billing_interval: 'monthly',
  current_period_end: '2026-10-24T08:00:00.000Z',
  cancel_at_period_end: false,
  stripe_customer_id: 'cus_1',
  ...overrides,
});

const CASES = [
  { status: 'active', plan: 'starter' },
  { status: 'trialing', plan: 'starter' },
  { status: 'past_due', plan: 'starter' },
  { status: 'incomplete', plan: 'hobby' },
  { status: 'canceled', plan: 'hobby' },
] as const;

describe('reading a subscription row back into a plan', () => {
  beforeEach(() => {
    holder.rows = [];
  });

  it.each(CASES)('the widget and answer engine see $plan for a $status row', async (fixture) => {
    const service = createFakeService({ subscriptions: [row({ status: fixture.status })] });

    const plan = await loadOwnerPlan(service.client, OWNER);

    expect(plan.id).toBe(fixture.plan);
    expect(plan.leadCapture).toBe(fixture.plan !== 'hobby');
  });

  it.each(CASES)(
    'the Billing and Account screens show $plan for a $status row',
    async (fixture) => {
      holder.rows = [row({ status: fixture.status })];

      const account = await getAccountPlan();

      expect(account.plan.id).toBe(fixture.plan);
      expect(account.status).toBe(fixture.status);
    },
  );

  it('treats an account with no row as Hobby', async () => {
    const service = createFakeService({ subscriptions: [] });

    expect((await loadOwnerPlan(service.client, OWNER)).id).toBe('hobby');
    expect((await getAccountPlan()).plan.id).toBe('hobby');
  });
});
