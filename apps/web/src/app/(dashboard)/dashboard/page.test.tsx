import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAccountAssistant, redirect, requireUser } = vi.hoisted(() => ({
  getAccountAssistant: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
  requireUser: vi.fn(),
}));

vi.mock('@/lib/assistants', () => ({ getAccountAssistant }));
vi.mock('@/lib/session', () => ({ requireUser }));
vi.mock('next/navigation', () => ({ redirect }));

import DashboardPage from './page';

describe('/dashboard', () => {
  beforeEach(() => {
    requireUser.mockResolvedValue({ user: { id: 'user' } });
  });

  it("opens the account's assistant at its Overview", async () => {
    getAccountAssistant.mockResolvedValue({ id: 'asst', name: 'Acme Docs', slug: 'acme-docs' });

    await expect(DashboardPage()).rejects.toThrow('REDIRECT /a/asst');
  });

  it('sends an account without an assistant to onboarding', async () => {
    getAccountAssistant.mockResolvedValue(null);

    await expect(DashboardPage()).rejects.toThrow('REDIRECT /onboarding');
  });

  it('checks the session before reading anything', async () => {
    requireUser.mockRejectedValue(new Error('REDIRECT /login'));

    await expect(DashboardPage()).rejects.toThrow('REDIRECT /login');
    expect(getAccountAssistant).not.toHaveBeenCalled();
  });
});
