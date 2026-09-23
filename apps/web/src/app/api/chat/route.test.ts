import { type ChatStreamEvent, readChatStream } from '@parbot/shared';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  user: null as { id: string } | null,
  assistant: null as { id: string; owner_id: string; name: string; instructions: string | null } | null,
}));

const engine = vi.hoisted(() => ({
  streamAnswer: vi.fn(),
  rateLimit: vi.fn(() => ({ allowed: true, remaining: 29, retryAfterMs: 0 })),
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(async () => ({
    user: session.user,
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: session.assistant, error: null }) }),
        }),
      }),
    },
  })),
}));

vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: () => ({ service: true }) }));
vi.mock('@/lib/ai', () => ({ getAiProvider: () => ({ name: 'stub' }) }));

vi.mock('@/lib/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/engine')>();

  return { ...actual, streamAnswer: engine.streamAnswer, rateLimit: engine.rateLimit };
});

import { POST } from './route';

const ASSISTANT = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';

const post = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const events = async (response: Response) => {
  const collected: ChatStreamEvent[] = [];

  for await (const event of readChatStream(response)) {
    collected.push(event);
  }

  return collected;
};

describe('POST /api/chat', () => {
  beforeEach(() => {
    session.user = { id: 'user-1' };
    session.assistant = { id: ASSISTANT, owner_id: 'user-1', name: 'Docs', instructions: null };
    engine.streamAnswer.mockImplementation(async function* () {
      yield { type: 'meta', conversationId: CONVERSATION, userMessageId: 'u', assistantMessageId: 'a' };
      yield { type: 'token', text: 'Hello' };
      yield { type: 'done', answered: true, latencyMs: 5 };
    });
    engine.rateLimit.mockReturnValue({ allowed: true, remaining: 29, retryAfterMs: 0 });
  });

  it('rejects a body that is not JSON with an error event', async () => {
    const response = await post('{nope');

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await events(response)).toEqual([{ type: 'error', code: 'bad_request', message: expect.any(String) }]);
  });

  it('validates ids and the message length', async () => {
    expect((await post({ assistantId: 'x', conversationId: CONVERSATION, message: 'hi' })).status).toBe(400);
    expect((await post({ assistantId: ASSISTANT, conversationId: CONVERSATION, message: '   ' })).status).toBe(400);
    expect((await post({ assistantId: ASSISTANT, conversationId: CONVERSATION, message: 'x'.repeat(2001) })).status).toBe(400);
    expect(engine.streamAnswer).not.toHaveBeenCalled();
  });

  it('answers 401 as an event when signed out', async () => {
    session.user = null;

    const response = await post({ assistantId: ASSISTANT, conversationId: CONVERSATION, message: 'hi' });

    expect(response.status).toBe(401);
    expect(await events(response)).toEqual([{ type: 'error', code: 'unauthorized', message: expect.any(String) }]);
  });

  it('answers 404 when the assistant is not the visitor\'s', async () => {
    session.assistant = null;

    const response = await post({ assistantId: ASSISTANT, conversationId: CONVERSATION, message: 'hi' });

    expect(response.status).toBe(404);
    expect(await events(response)).toEqual([{ type: 'error', code: 'not_found', message: expect.any(String) }]);
  });

  it('rate limits per user', async () => {
    engine.rateLimit.mockReturnValue({ allowed: false, remaining: 0, retryAfterMs: 4200 });

    const response = await post({ assistantId: ASSISTANT, conversationId: CONVERSATION, message: 'hi' });

    expect(response.status).toBe(429);
    expect(engine.rateLimit).toHaveBeenCalledWith('chat:user-1', { limit: 30, windowMs: 60_000 });
    expect(await events(response)).toEqual([{ type: 'error', code: 'rate_limited', message: 'You are sending messages quickly. Try again in 5 seconds.' }]);
  });

  it('streams the engine\'s events for a valid request', async () => {
    const response = await post({ assistantId: ASSISTANT, conversationId: CONVERSATION, message: '  How do I rotate a key?  ' });

    expect(response.status).toBe(200);
    expect(await events(response)).toEqual([
      { type: 'meta', conversationId: CONVERSATION, userMessageId: 'u', assistantMessageId: 'a' },
      { type: 'token', text: 'Hello' },
      { type: 'done', answered: true, latencyMs: 5 },
    ]);
    expect(engine.streamAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        service: { service: true },
        provider: { name: 'stub' },
        assistant: session.assistant,
        conversation: { id: CONVERSATION, channel: 'app' },
        message: 'How do I rotate a key?',
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
