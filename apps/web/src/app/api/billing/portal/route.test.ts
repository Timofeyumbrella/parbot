import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();

vi.mock('@/lib/session', () => ({
  getSession: () => getSession(),
}));

vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
vi.stubEnv('BILLING_PROVIDER', 'mock');
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');

const { POST } = await import('./route');

const post = () =>
  POST(
    new Request('http://localhost:3106/api/billing/portal', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3106' },
      body: '{}',
    }),
  );

describe('POST /api/billing/portal', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ user: { id: '00000000-0000-4000-8000-000000000001', email: 'demo@parbot.dev' }, supabase: {} });
  });

  it('rejects signed-out visitors', async () => {
    getSession.mockResolvedValue({ user: null, supabase: {} });

    expect((await post()).status).toBe(401);
  });

  it('returns the mock portal URL on the mock provider', async () => {
    const response = await post();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ url: 'http://localhost:3106/billing?mock_portal=1' });
  });
});
