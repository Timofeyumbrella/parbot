import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();

vi.mock('@/lib/session', () => ({
  getSession: () => getSession(),
}));

vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
vi.stubEnv('BILLING_PROVIDER', 'mock');
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');

const { POST } = await import('./route');

const user = { id: '00000000-0000-4000-8000-000000000001', email: 'demo@parbot.dev' };

const post = (body: unknown, origin = 'http://localhost:3106') =>
  POST(
    new Request('http://localhost:3106/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ user, supabase: {} });
  });

  it('rejects signed-out visitors', async () => {
    getSession.mockResolvedValue({ user: null, supabase: {} });

    const response = await post({ planId: 'starter', interval: 'monthly' });

    expect(response.status).toBe(401);
  });

  it('rejects Hobby, which has no checkout', async () => {
    const response = await post({ planId: 'hobby', interval: 'monthly' });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/Hobby/) });
  });

  it('rejects a body it cannot validate', async () => {
    expect((await post({ planId: 'enterprise', interval: 'monthly' })).status).toBe(400);
    expect((await post({ planId: 'starter', interval: 'weekly' })).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
  });

  it('returns where to go next, back to the dev server that asked', async () => {
    const response = await post({ planId: 'starter', interval: 'yearly' });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: 'http://localhost:3106/billing?mock_plan=starter&mock_interval=yearly',
    });
  });

  it('defaults to monthly and ignores a foreign origin', async () => {
    const response = await post({ planId: 'growth' }, 'https://evil.example');

    await expect(response.json()).resolves.toEqual({
      url: 'http://localhost:3000/billing?mock_plan=growth&mock_interval=monthly',
    });
  });
});
