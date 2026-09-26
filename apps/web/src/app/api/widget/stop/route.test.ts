// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetRateLimits } from '@/lib/engine';
import { usagePeriodStart } from '@/lib/plans';
import {
  createServiceClient,
  createTestAccount,
  deleteTestAccount,
  hasLocalDb,
  type TestAccount,
} from '@/test/local-db';

vi.mock('@/lib/supabase/service', async () => {
  const { createServiceClient: create } = await import('@/test/local-db');

  return { createSupabaseServiceClient: create };
});

import { OPTIONS, POST } from './route';

const VISITOR = 'v_0123456789abcdef0123456789abcdef';
const STRANGER = 'v_fedcba9876543210fedcba9876543210';

/** Sent the way the widget sends it: text/plain, so the browser skips the preflight. */
const post = (payload: unknown) =>
  POST(
    new Request('http://localhost:3000/api/widget/stop', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain;charset=UTF-8',
        origin: 'https://docs.example.com',
      },
      body: JSON.stringify(payload),
    }),
  );

beforeEach(() => {
  resetRateLimits();
});

describe('POST /api/widget/stop', () => {
  it('answers the preflight like the other widget routes', async () => {
    const response = OPTIONS(
      new Request('http://localhost:3000/api/widget/stop', {
        method: 'OPTIONS',
        headers: { origin: 'https://docs.example.com' },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://docs.example.com');
  });

  it('refuses a malformed stop before looking anything up', async () => {
    const response = await post({
      key: 'pb_0123456789abcdef0123456789abcdef',
      visitorId: VISITOR,
      conversationId: crypto.randomUUID(),
      messageId: 'not-a-uuid',
      text: '',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'bad_request' } });
  });
});

describe.skipIf(!hasLocalDb)('POST /api/widget/stop against the local database', () => {
  const service = createServiceClient();
  let owner: TestAccount | null = null;
  let key = '';

  const usage = async () => {
    const { data } = await service
      .from('usage_counters')
      .select('value')
      .eq('owner_id', owner!.userId)
      .eq('metric', 'messages')
      .eq('period_start', usagePeriodStart())
      .maybeSingle();

    return Number(data?.value ?? 0);
  };

  /** A visitor's finished widget exchange, as the engine saves it, counted against the month. */
  const savedExchange = async (visitorId: string) => {
    const conversationId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const row = { assistant_id: owner!.assistantId, owner_id: owner!.userId };

    await service
      .from('conversations')
      .insert({ id: conversationId, ...row, channel: 'widget', visitor_id: visitorId });
    await service.from('messages').insert({
      ...row,
      conversation_id: conversationId,
      role: 'user',
      content: 'Keys?',
      citations: [],
    });
    await service.from('messages').insert({
      ...row,
      id: messageId,
      conversation_id: conversationId,
      role: 'assistant',
      content: 'Create keys in Settings [1].',
      citations: [{ index: 1, documentId: 'd1', title: 'Auth', url: null, snippet: 'a' }],
      answered: true,
    });
    await service.rpc('reserve_message', { owner: owner!.userId, max_allowed: 1000 });

    return { conversationId, messageId };
  };

  const stopRow = async (messageId: string) => {
    const { data } = await service
      .from('message_stops')
      .select('conversation_id, assistant_id, owner_id, content')
      .eq('message_id', messageId)
      .maybeSingle();

    return data;
  };

  beforeAll(async () => {
    owner = await createTestAccount(service, 'widget-stop');

    const { data } = await service
      .from('assistants')
      .select('public_key')
      .eq('id', owner.assistantId)
      .single();

    key = data!.public_key;
  });

  afterAll(async () => {
    await deleteTestAccount(service, owner);
  });

  it('records a stop that overtakes the question, filed under the owner', async () => {
    const conversationId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const response = await post({ key, visitorId: VISITOR, conversationId, messageId, text: '' });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://docs.example.com');
    expect(await stopRow(messageId)).toEqual({
      conversation_id: conversationId,
      assistant_id: owner!.assistantId,
      owner_id: owner!.userId,
      content: '',
    });
  });

  it('cuts an answer saved before the stop back to what the widget showed, unmetered', async () => {
    const { conversationId, messageId } = await savedExchange(VISITOR);
    const before = await usage();
    const response = await post({
      key,
      visitorId: VISITOR,
      conversationId,
      messageId,
      text: 'Create keys',
    });

    expect(response.status).toBe(200);
    expect(
      (
        await service
          .from('messages')
          .select('content, answered, citations')
          .eq('id', messageId)
          .single()
      ).data,
    ).toEqual({ content: 'Create keys', answered: null, citations: [] });
    expect(await usage()).toBe(before - 1);
  });

  it("refuses another visitor's conversation and leaves its answer alone", async () => {
    const { conversationId, messageId } = await savedExchange(STRANGER);
    const before = await usage();
    const response = await post({ key, visitorId: VISITOR, conversationId, messageId, text: '' });

    expect(response.status).toBe(404);
    expect(await stopRow(messageId)).toBeNull();
    expect(
      (await service.from('messages').select('answered').eq('id', messageId).single()).data,
    ).toEqual({ answered: true });
    expect(await usage()).toBe(before);
  });

  it('refuses an unknown key', async () => {
    const response = await post({
      key: 'pb_ffffffffffffffffffffffffffffffff',
      visitorId: VISITOR,
      conversationId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      text: '',
    });

    expect(response.status).toBe(404);
  });
});
