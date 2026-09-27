import { type ChatStreamEvent, readChatStream } from '@parbot/shared';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  user: null as { id: string } | null,
  assistant: null as {
    id: string;
    owner_id: string;
    name: string;
    instructions: string | null;
  } | null,
}));

const engine = vi.hoisted(() => ({
  streamAnswer: vi.fn(),
  chargeRateLimits: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })),
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

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({ service: true }),
}));
vi.mock('@/lib/ai', () => ({ getAiProvider: () => ({ name: 'stub' }) }));

vi.mock('@/lib/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/engine')>();

  return {
    ...actual,
    streamAnswer: engine.streamAnswer,
    chargeRateLimits: engine.chargeRateLimits,
  };
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
      yield {
        type: 'meta',
        conversationId: CONVERSATION,
        userMessageId: 'u',
        assistantMessageId: 'a',
      };
      yield { type: 'token', text: 'Hello' };
      yield { type: 'done', answered: true, latencyMs: 5 };
    });
    engine.chargeRateLimits.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  });

  it('rejects a body that is not JSON with an error event', async () => {
    const response = await post('{nope');

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await events(response)).toEqual([
      { type: 'error', code: 'bad_request', message: expect.any(String) },
    ]);
  });

  it('validates ids and the message length, naming what was wrong', async () => {
    const badAssistant = await post({
      assistantId: 'x',
      conversationId: CONVERSATION,
      message: 'hi',
    });
    const badConversation = await post({
      assistantId: ASSISTANT,
      conversationId: 'nope',
      message: 'hi',
    });
    const empty = await post({
      assistantId: ASSISTANT,
      conversationId: CONVERSATION,
      message: '   ',
    });
    const long = await post({
      assistantId: ASSISTANT,
      conversationId: CONVERSATION,
      message: 'x'.repeat(2001),
    });

    expect([badAssistant.status, badConversation.status, empty.status, long.status]).toEqual([
      400, 400, 400, 400,
    ]);
    expect((await events(badAssistant))[0]).toMatchObject({
      code: 'bad_request',
      message: expect.stringMatching(/assistant link/),
    });
    expect((await events(badConversation))[0]).toMatchObject({
      code: 'bad_request',
      message: 'That conversation link is not valid. Start a new chat.',
    });
    expect((await events(empty))[0]).toMatchObject({
      message: 'Ask something between 1 and 2,000 characters.',
    });
    expect((await events(long))[0]).toMatchObject({
      message: 'Ask something between 1 and 2,000 characters.',
    });
    expect(engine.streamAnswer).not.toHaveBeenCalled();
  });

  it('answers 401 as an event when signed out', async () => {
    session.user = null;

    const response = await post({
      assistantId: ASSISTANT,
      conversationId: CONVERSATION,
      message: 'hi',
    });

    expect(response.status).toBe(401);
    expect(await events(response)).toEqual([
      { type: 'error', code: 'unauthorized', message: expect.any(String) },
    ]);
  });

  it("answers 404 when the assistant is not the visitor's", async () => {
    session.assistant = null;

    const response = await post({
      assistantId: ASSISTANT,
      conversationId: CONVERSATION,
      message: 'hi',
    });

    expect(response.status).toBe(404);
    expect(await events(response)).toEqual([
      { type: 'error', code: 'not_found', message: expect.any(String) },
    ]);
  });

  it('rate limits per user', async () => {
    engine.chargeRateLimits.mockResolvedValue({ allowed: false, retryAfterMs: 4200 });

    const response = await post({
      assistantId: ASSISTANT,
      conversationId: CONVERSATION,
      message: 'hi',
    });

    expect(response.status).toBe(429);
    // Charged once, to the account's own bucket, in the limiter every instance shares.
    expect(engine.chargeRateLimits).toHaveBeenCalledTimes(1);
    expect(engine.chargeRateLimits).toHaveBeenCalledWith({ service: true }, [
      ['chat:user-1', { limit: 30, windowMs: 60_000 }],
    ]);
    expect(await events(response)).toEqual([
      {
        type: 'error',
        code: 'rate_limited',
        message: 'You are sending messages quickly. Try again in 5 seconds.',
      },
    ]);
    expect(engine.streamAnswer).not.toHaveBeenCalled();
  });

  it("streams the engine's events for a valid request", async () => {
    const response = await post({
      assistantId: ASSISTANT,
      conversationId: CONVERSATION,
      message: '  How do I rotate a key?  ',
    });

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

  it('saves the answer under the id the client proposed, so Stop can name it early', async () => {
    const proposed = '44444444-4444-4444-8444-444444444444';

    await events(
      await post({
        assistantId: ASSISTANT,
        conversationId: CONVERSATION,
        message: 'hi',
        assistantMessageId: proposed,
      }),
    );

    expect(engine.streamAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ assistantMessageId: proposed }),
    );

    const malformed = await post({
      assistantId: ASSISTANT,
      conversationId: CONVERSATION,
      message: 'hi',
      assistantMessageId: 'nope',
    });

    expect(malformed.status).toBe(400);
    expect(engine.streamAnswer).toHaveBeenCalledTimes(1);
  });

  it('passes the referenced sources on, and leaves them out when none were sent', async () => {
    const source = '55555555-5555-4555-8555-555555555555';

    await events(
      await post({
        assistantId: ASSISTANT,
        conversationId: CONVERSATION,
        message: 'What does this file say about limits?',
        references: [source],
      }),
    );
    await events(
      await post({ assistantId: ASSISTANT, conversationId: CONVERSATION, message: 'And then?' }),
    );
    await events(
      await post({
        assistantId: ASSISTANT,
        conversationId: CONVERSATION,
        message: 'Forget the file.',
        references: [],
      }),
    );

    expect(engine.streamAnswer.mock.calls.map(([params]) => params.references)).toEqual([
      [source],
      undefined,
      [],
    ]);
  });

  it('refuses references that are not source ids, or too many of them', async () => {
    const notIds = await post({
      assistantId: ASSISTANT,
      conversationId: CONVERSATION,
      message: 'hi',
      references: ['../../etc/passwd'],
    });
    const tooMany = await post({
      assistantId: ASSISTANT,
      conversationId: CONVERSATION,
      message: 'hi',
      references: Array.from({ length: 11 }, () => crypto.randomUUID()),
    });
    const notAList = await post({
      assistantId: ASSISTANT,
      conversationId: CONVERSATION,
      message: 'hi',
      references: '55555555-5555-4555-8555-555555555555',
    });

    for (const response of [notIds, tooMany, notAList]) {
      expect(response.status).toBe(400);
      expect(await events(response)).toEqual([
        {
          type: 'error',
          code: 'bad_request',
          message: 'Reference up to 10 files or sources, picked from the list, and send again.',
        },
      ]);
    }

    expect(engine.streamAnswer).not.toHaveBeenCalled();
  });
});
