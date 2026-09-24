import type { ChatStreamEvent } from '@parbot/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetRateLimits, type AnswerParams } from '@/lib/engine';
import { assistantRow, createFakeService, type FakeService, PUBLIC_KEY } from '@/lib/widget-api.fixtures';

import { OPTIONS, POST } from './route';

const holder = vi.hoisted(() => ({ service: null as unknown, answers: [] as unknown[] }));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => (holder.service as FakeService).client,
}));

vi.mock('@/lib/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/engine')>();

  return {
    ...actual,
    streamAnswer: async function* (params: AnswerParams): AsyncGenerator<ChatStreamEvent> {
      holder.answers.push(params);
      yield { type: 'meta', conversationId: params.conversation.id, userMessageId: 'u1', assistantMessageId: 'a1' };
      yield { type: 'token', text: 'API keys live in Settings [1].' };
      yield { type: 'citations', citations: [{ index: 1, documentId: 'd1', title: 'Auth', url: null, snippet: 'x' }] };
      yield { type: 'done', answered: true, latencyMs: 5 };
    },
  };
});

const VISITOR = 'v_0123456789abcdef0123456789abcdef';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';

const body = (overrides: Record<string, unknown> = {}) => ({
  key: PUBLIC_KEY,
  visitorId: VISITOR,
  conversationId: CONVERSATION,
  message: 'Where do I create an API key?',
  pageUrl: 'https://docs.example.com/auth',
  ...overrides,
});

const post = (payload: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost:3000/api/widget/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    }),
  );

describe('POST /api/widget/chat', () => {
  beforeEach(() => {
    resetRateLimits();
    holder.answers = [];
    holder.service = createFakeService({ assistants: [assistantRow()] });
  });

  it('validates the body and says which field is wrong', async () => {
    const missing = await post(body({ visitorId: undefined }));
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: 'bad_request', message: expect.stringContaining('visitorId') } });

    const long = await post(body({ message: 'x'.repeat(2001) }));
    expect(long.status).toBe(400);

    const badConversation = await post(body({ conversationId: 'nope' }));
    expect(badConversation.status).toBe(400);

    const broken = await post('{not json');
    expect(broken.status).toBe(400);
    expect(broken.headers.get('access-control-allow-origin')).toBe('*');

    expect(holder.answers).toHaveLength(0);
  });

  it('answers 404 for an unknown key', async () => {
    const response = await post(body({ key: 'pb_ffffffffffffffffffffffffffffffff' }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'not_found' } });
  });

  it('refuses origins that are not allowed', async () => {
    holder.service = createFakeService({ assistants: [assistantRow({ allowed_origins: ['docs.example.com'] })] });

    const refused = await post(body(), { origin: 'https://evil.example' });
    expect(refused.status).toBe(403);
    await expect(refused.json()).resolves.toMatchObject({ error: { code: 'origin_not_allowed' } });

    const none = await post(body());
    expect(none.status).toBe(403);

    const allowed = await post(body(), { origin: 'https://docs.example.com' });
    expect(allowed.status).toBe(200);
  });

  it('streams the answer with CORS headers and passes the widget conversation through', async () => {
    const response = await post(body(), { origin: 'https://docs.example.com' });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('access-control-allow-origin')).toBe('https://docs.example.com');
    expect(response.headers.get('cache-control')).toContain('no-cache');

    const text = await response.text();
    expect(text).toContain('data: {"type":"meta"');
    expect(text).toContain('API keys live in Settings [1].');
    expect(text).toContain('"type":"done"');

    expect(holder.answers).toHaveLength(1);
    expect(holder.answers[0]).toMatchObject({
      assistant: { id: '11111111-1111-4111-8111-111111111111', owner_id: '00000000-0000-4000-8000-000000000001' },
      conversation: { id: CONVERSATION, channel: 'widget', visitorId: VISITOR, pageUrl: 'https://docs.example.com/auth' },
      message: 'Where do I create an API key?',
    });
  });

  it('limits one visitor to 12 messages a minute', async () => {
    for (let index = 0; index < 12; index += 1) {
      expect((await post(body())).status).toBe(200);
    }

    const limited = await post(body());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    await expect(limited.json()).resolves.toMatchObject({ error: { code: 'rate_limited' } });

    // Another visitor from another address is unaffected.
    const other = await post(body({ visitorId: 'v_other_visitor_00000000' }), { 'x-forwarded-for': '203.0.113.7' });
    expect(other.status).toBe(200);
  });

  it('limits one address to 60 messages a minute across visitors', async () => {
    for (let index = 0; index < 60; index += 1) {
      const response = await post(body({ visitorId: `v_visitor_${String(index).padStart(12, '0')}` }), { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' });
      expect(response.status).toBe(200);
    }

    const limited = await post(body({ visitorId: 'v_visitor_999999999999' }), { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' });
    expect(limited.status).toBe(429);

    const elsewhere = await post(body({ visitorId: 'v_visitor_999999999999' }), { 'x-forwarded-for': '203.0.113.10' });
    expect(elsewhere.status).toBe(200);
  });

  it('answers preflight requests', async () => {
    const response = await OPTIONS(new Request('http://localhost:3000/api/widget/chat', { method: 'OPTIONS' }));

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')).toBe('content-type');
  });
});
