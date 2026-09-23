import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetRateLimits } from '@/lib/engine';
import { assistantRow, createFakeService, type FakeService, type FakeTables, PUBLIC_KEY } from '@/lib/widget-api.fixtures';

import { OPTIONS, POST } from './route';

const holder = vi.hoisted(() => ({ service: null as unknown }));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => (holder.service as FakeService).client,
}));

const OWNER = '00000000-0000-4000-8000-000000000001';
const ASSISTANT = '11111111-1111-4111-8111-111111111111';
const VISITOR = 'v_0123456789abcdef0123456789abcdef';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';

const starter = (tables: FakeTables = {}) =>
  createFakeService({
    assistants: [assistantRow()],
    subscriptions: [{ account_id: OWNER, plan_id: 'starter', status: 'active' }],
    conversations: [{ id: CONVERSATION, assistant_id: ASSISTANT, visitor_id: VISITOR }],
    ...tables,
  });

const body = (overrides: Record<string, unknown> = {}) => ({
  key: PUBLIC_KEY,
  visitorId: VISITOR,
  conversationId: CONVERSATION,
  email: 'Ada@Example.com',
  note: 'Please write back',
  pageUrl: 'https://docs.example.com/auth',
  ...overrides,
});

const post = (payload: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost:3000/api/widget/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    }),
  );

describe('POST /api/widget/lead', () => {
  beforeEach(() => {
    resetRateLimits();
    holder.service = starter();
  });

  it('validates the body', async () => {
    const response = await post(body({ email: 'not-an-email' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'bad_request', message: expect.stringContaining('email') } });
    expect((holder.service as FakeService).inserted.leads).toBeUndefined();
  });

  it('answers 404 for an unknown key and 403 for a foreign origin', async () => {
    expect((await post(body({ key: 'pb_ffffffffffffffffffffffffffffffff' }))).status).toBe(404);

    holder.service = starter({ assistants: [assistantRow({ allowed_origins: ['docs.example.com'] })] });
    expect((await post(body(), { origin: 'https://evil.example' })).status).toBe(403);
  });

  it('refuses when lead capture is off for the plan or the assistant', async () => {
    holder.service = starter({ subscriptions: [] });
    const hobby = await post(body());
    expect(hobby.status).toBe(403);
    await expect(hobby.json()).resolves.toMatchObject({ error: { code: 'unauthorized' } });

    holder.service = starter({ assistants: [assistantRow({ lead_capture: false })] });
    expect((await post(body())).status).toBe(403);
  });

  it('only links a conversation that belongs to this visitor and assistant', async () => {
    holder.service = starter({ conversations: [{ id: CONVERSATION, assistant_id: ASSISTANT, visitor_id: 'v_someone_else_000000' }] });
    expect((await post(body())).status).toBe(404);

    holder.service = starter({ conversations: [{ id: CONVERSATION, assistant_id: 'other', visitor_id: VISITOR }] });
    expect((await post(body())).status).toBe(404);

    holder.service = starter({ conversations: [] });
    expect((await post(body())).status).toBe(404);
    expect((await post(body({ conversationId: undefined }))).status).toBe(201);
  });

  it('stores the lead under the owner and answers 201 with CORS headers', async () => {
    const response = await post(body(), { origin: 'https://docs.example.com' });

    expect(response.status).toBe(201);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://docs.example.com');
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect((holder.service as FakeService).inserted.leads).toEqual([
      {
        assistant_id: ASSISTANT,
        owner_id: OWNER,
        conversation_id: CONVERSATION,
        email: 'ada@example.com',
        note: 'Please write back',
        page_url: 'https://docs.example.com/auth',
      },
    ]);
  });

  it('says so when the insert fails', async () => {
    (holder.service as FakeService).failInsert('leads', 'boom');

    const response = await post(body());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'internal' } });
  });

  it('limits one visitor to a few leads a minute', async () => {
    for (let index = 0; index < 5; index += 1) {
      expect((await post(body({ conversationId: undefined }))).status).toBe(201);
    }

    expect((await post(body({ conversationId: undefined }))).status).toBe(429);
  });

  it('answers preflight requests', async () => {
    const response = await OPTIONS(new Request('http://localhost:3000/api/widget/lead', { method: 'OPTIONS' }));

    expect(response.status).toBe(204);
  });
});
