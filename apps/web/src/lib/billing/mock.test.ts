import { describe, expect, it } from 'vitest';

import { createMockProvider } from './mock';

describe('mock billing provider', () => {
  const provider = createMockProvider();

  it('is named mock', () => {
    expect(provider.name).toBe('mock');
  });

  it('sends checkout back to the billing screen with the chosen plan', async () => {
    const { url } = await provider.createCheckout({
      accountId: 'acc',
      email: 'demo@parbot.dev',
      planId: 'starter',
      interval: 'yearly',
      returnUrl: 'http://localhost:3000/billing',
    });

    expect(url).toBe('http://localhost:3000/billing?mock_plan=starter&mock_interval=yearly');
  });

  it('keeps parameters the return URL already has', async () => {
    const { url } = await provider.createCheckout({
      accountId: 'acc',
      email: '',
      planId: 'growth',
      interval: 'monthly',
      returnUrl: 'http://localhost:3000/billing?from=signup',
    });

    expect(new URL(url).searchParams.get('from')).toBe('signup');
    expect(new URL(url).searchParams.get('mock_plan')).toBe('growth');
  });

  it('sends the portal back with the mock portal flag', async () => {
    const { url } = await provider.createPortal({ accountId: 'acc', returnUrl: 'http://localhost:3000/billing' });

    expect(url).toBe('http://localhost:3000/billing?mock_portal=1');
  });
});
