import { DEFAULT_WIDGET_THEME } from '@parbot/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appOrigin } from '@/lib/widget-api';
import {
  assistantRow,
  createFakeService,
  type FakeService,
  PUBLIC_KEY,
} from '@/lib/widget-api.fixtures';

import { GET, OPTIONS } from './route';

const holder = vi.hoisted(() => ({ service: null as unknown }));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => (holder.service as FakeService).client,
}));

const OWNER = '00000000-0000-4000-8000-000000000001';

const get = (query: string, headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost:3000/api/widget/config${query}`, { headers }));

describe('GET /api/widget/config', () => {
  beforeEach(() => {
    holder.service = createFakeService({ assistants: [assistantRow()], subscriptions: [] });
  });

  it('needs a key and answers 404 for one nobody has', async () => {
    const missing = await get('');
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: 'bad_request' } });

    const unknown = await get('?key=pb_ffffffffffffffffffffffffffffffff');
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toMatchObject({ error: { code: 'not_found' } });

    const malformed = await get('?key=not%20a%20key');
    expect(malformed.status).toBe(404);
  });

  it('returns the gated config on Hobby with cache and CORS headers', async () => {
    const response = await get(`?key=${PUBLIC_KEY}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('vary')).toBe('Origin');
    await expect(response.json()).resolves.toEqual({
      assistantId: '11111111-1111-4111-8111-111111111111',
      name: 'Docs bot',
      welcomeMessage: 'Ask me about the docs.',
      suggestedQuestions: ['One', 'Two', 'Three', 'Four'],
      mode: 'bubble',
      theme: DEFAULT_WIDGET_THEME,
      hideBranding: false,
      leadCapture: false,
      modes: ['bubble'],
    });
  });

  it('never caches a request that carries the preview version', async () => {
    const response = await get(`?key=${PUBLIC_KEY}&v=3`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('repeats the error message at the top level, so a client reading { message } gets it too', async () => {
    const response = await get('?key=pb_ffffffffffffffffffffffffffffffff');

    await expect(response.json()).resolves.toEqual({
      error: { code: 'not_found', message: 'No assistant has that key.' },
      message: 'No assistant has that key.',
    });
  });

  it('keeps the paid settings on Starter and echoes the origin', async () => {
    holder.service = createFakeService({
      assistants: [assistantRow()],
      subscriptions: [{ account_id: OWNER, plan_id: 'starter', status: 'active' }],
    });

    const response = await get(`?key=${PUBLIC_KEY}`, { origin: 'https://docs.example.com' });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://docs.example.com');
    await expect(response.json()).resolves.toMatchObject({
      mode: 'palette',
      theme: { scheme: 'dark', accent: '#2563eb', position: 'left', radius: 'lg' },
      hideBranding: true,
      leadCapture: true,
    });
  });

  it('treats a cancelled subscription as Hobby', async () => {
    holder.service = createFakeService({
      assistants: [assistantRow()],
      subscriptions: [{ account_id: OWNER, plan_id: 'growth', status: 'canceled' }],
    });

    await expect((await get(`?key=${PUBLIC_KEY}`)).json()).resolves.toMatchObject({
      mode: 'bubble',
      hideBranding: false,
    });
  });

  it('refuses origins the owner did not allow, but always allows the app itself', async () => {
    holder.service = createFakeService({
      assistants: [assistantRow({ allowed_origins: ['docs.example.com', '*.acme.io'] })],
    });

    const refused = await get(`?key=${PUBLIC_KEY}`, { origin: 'https://evil.example' });
    expect(refused.status).toBe(403);
    await expect(refused.json()).resolves.toMatchObject({ error: { code: 'origin_not_allowed' } });

    expect((await get(`?key=${PUBLIC_KEY}`)).status).toBe(403);
    expect((await get(`?key=${PUBLIC_KEY}`, { origin: 'https://DOCS.example.com' })).status).toBe(
      200,
    );
    expect((await get(`?key=${PUBLIC_KEY}`, { origin: 'https://sub.acme.io' })).status).toBe(200);
    expect(
      (await get(`?key=${PUBLIC_KEY}`, { referer: `${appOrigin()}/demo/${PUBLIC_KEY}` })).status,
    ).toBe(200);
  });

  it('allows the origin it is served on, so the preview works when the app runs somewhere other than NEXT_PUBLIC_APP_URL', async () => {
    holder.service = createFakeService({
      assistants: [assistantRow({ allowed_origins: ['docs.example.com'] })],
    });
    const served = 'http://localhost:3400';
    const at = (headers: Record<string, string>) =>
      GET(new Request(`${served}/api/widget/config?key=${PUBLIC_KEY}`, { headers }));

    expect(served).not.toBe(appOrigin());
    expect((await at({ origin: served })).status).toBe(200);
    expect((await at({ referer: `${served}/demo/${PUBLIC_KEY}?mode=palette` })).status).toBe(200);
    expect((await at({ origin: 'http://localhost:3401' })).status).toBe(403);
    expect((await at({})).status).toBe(403);
  });

  it('answers preflight requests', async () => {
    const response = await OPTIONS(
      new Request('http://localhost:3000/api/widget/config', {
        method: 'OPTIONS',
        headers: { origin: 'https://a.io' },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://a.io');
    expect(response.headers.get('access-control-allow-methods')).toContain('GET');
  });
});
