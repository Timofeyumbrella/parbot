import { describe, expect, it } from 'vitest';

import { billingReturnUrl, trustedOrigin } from './return-url';

const request = (origin?: string) =>
  new Request('http://internal/api/billing/checkout', { method: 'POST', headers: origin ? { origin } : {} });

describe('trustedOrigin', () => {
  it('uses the configured app URL when the request has no origin', () => {
    expect(trustedOrigin(request(), 'https://parbot.dev/')).toBe('https://parbot.dev');
  });

  it('honours the request origin when it is the app URL or a local dev server', () => {
    expect(trustedOrigin(request('https://parbot.dev'), 'https://parbot.dev')).toBe('https://parbot.dev');
    expect(trustedOrigin(request('http://localhost:3106'), 'http://localhost:3000')).toBe('http://localhost:3106');
    expect(trustedOrigin(request('http://127.0.0.1:3106'), 'http://localhost:3000')).toBe('http://127.0.0.1:3106');
  });

  it('ignores any other origin', () => {
    expect(trustedOrigin(request('https://evil.example'), 'https://parbot.dev')).toBe('https://parbot.dev');
    expect(trustedOrigin(request('not a url'), 'https://parbot.dev')).toBe('https://parbot.dev');
  });
});

describe('billingReturnUrl', () => {
  it('points at the billing screen', () => {
    expect(billingReturnUrl(request('http://localhost:3106'), 'http://localhost:3000')).toBe('http://localhost:3106/billing');
  });
});
