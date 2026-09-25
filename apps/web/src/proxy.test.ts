// @vitest-environment node
import { getRedirectUrl, unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config, proxy } from './proxy';

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));

const runsFor = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe('proxy matcher', () => {
  it.each([
    '/',
    '/dashboard',
    '/a/3fa85f64-5717-4562-b3fc-2c963f66afa6/chat',
    '/billing',
    '/account',
    '/onboarding',
    '/login',
    '/signup',
    '/api/chat',
  ])('runs for %s', (url) => {
    expect(runsFor(url)).toBe(true);
  });

  // Widget and webhook callers carry no session; uploads must reach their route whole; the demo page is public.
  it.each([
    '/api/widget/chat',
    '/api/widget/config',
    '/api/stripe/webhook',
    '/api/sources',
    '/api/sources/3fa85f64-5717-4562-b3fc-2c963f66afa6/reindex',
    '/api/health',
    '/demo/pb_0123456789abcdef0123456789abcdef',
    '/widget.js',
    '/widget.js.map',
    '/_next/static/chunks/main.js',
    '/favicon.ico',
    '/og.png',
  ])('stays out of %s', (url) => {
    expect(runsFor(url)).toBe(false);
  });
});

describe('proxy', () => {
  const visit = (path: string) => proxy(new NextRequest(new URL(path, 'http://localhost:3000')));

  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  it('sends a signed-out visitor to sign in and back to where they were going', async () => {
    const response = await visit('/billing?interval=yearly');

    expect(getRedirectUrl(response)).toBe(
      'http://localhost:3000/login?next=%2Fbilling%3Finterval%3Dyearly',
    );
  });

  it.each([
    '/dashboard',
    '/a/3fa85f64-5717-4562-b3fc-2c963f66afa6/knowledge',
    '/account',
    '/onboarding',
  ])('guards %s', async (path) => {
    expect(getRedirectUrl(await visit(path))).toMatch(/^http:\/\/localhost:3000\/login\?next=/);
  });

  it('lets a signed-out visitor see public pages', async () => {
    // "/a/" guards the assistant screens only; "/about" merely starts with the same letter.
    for (const path of ['/', '/login', '/signup', '/about']) {
      expect(getRedirectUrl(await visit(path))).toBeNull();
    }
  });

  it('sends a signed-in visitor from the sign-in pages to the dashboard and lets them through elsewhere', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    expect(getRedirectUrl(await visit('/login?next=/billing'))).toBe(
      'http://localhost:3000/dashboard',
    );
    expect(getRedirectUrl(await visit('/signup'))).toBe('http://localhost:3000/dashboard');
    expect(getRedirectUrl(await visit('/billing'))).toBeNull();
  });
});
