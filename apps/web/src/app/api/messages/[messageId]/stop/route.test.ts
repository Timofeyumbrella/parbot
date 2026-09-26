// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/db';
import { resetRateLimits } from '@/lib/engine';
import { usagePeriodStart } from '@/lib/plans';
import {
  createServiceClient,
  createTestAccount,
  deleteTestAccount,
  hasLocalDb,
  type TestAccount,
} from '@/test/local-db';

const session = vi.hoisted(() => ({
  user: null as { id: string } | null,
  supabase: null as unknown,
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(async () => ({ user: session.user, supabase: session.supabase })),
}));

vi.mock('@/lib/supabase/service', async () => {
  const { createServiceClient: create } = await import('@/test/local-db');

  return { createSupabaseServiceClient: create };
});

import { POST } from './route';

const MESSAGE = '33333333-3333-4333-8333-333333333333';
const ASSISTANT = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';

const post = (id: string, body: unknown) =>
  POST(
    new NextRequest(`http://localhost/api/messages/${id}/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ messageId: id }) },
  );

beforeEach(() => {
  resetRateLimits();
});

describe('POST /api/messages/[messageId]/stop', () => {
  it('validates the id and the body before anything else', async () => {
    session.user = { id: 'user-1' };

    expect(
      (await post('nope', { assistantId: ASSISTANT, conversationId: CONVERSATION, text: '' }))
        .status,
    ).toBe(400);
    expect((await post(MESSAGE, '{')).status).toBe(400);
    expect((await post(MESSAGE, { assistantId: ASSISTANT, text: 'x' })).status).toBe(400);
    expect(
      (
        await post(MESSAGE, {
          assistantId: ASSISTANT,
          conversationId: CONVERSATION,
          text: 'x'.repeat(20_001),
        })
      ).status,
    ).toBe(400);
  });

  it('requires a session', async () => {
    session.user = null;

    const response = await post(MESSAGE, {
      assistantId: ASSISTANT,
      conversationId: CONVERSATION,
      text: '',
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Sign in to stop an answer.' });
  });
});

describe.skipIf(!hasLocalDb)(
  'POST /api/messages/[messageId]/stop against the local database',
  () => {
    const service = createServiceClient();
    let owner: TestAccount | null = null;
    let intruder: TestAccount | null = null;

    const signInAs = (account: TestAccount) => {
      session.user = { id: account.userId };
      session.supabase = account.client as SupabaseClient<Database>;
    };

    const usage = async (account: TestAccount) => {
      const { data } = await service
        .from('usage_counters')
        .select('value')
        .eq('owner_id', account.userId)
        .eq('metric', 'messages')
        .eq('period_start', usagePeriodStart())
        .maybeSingle();

      return Number(data?.value ?? 0);
    };

    /** A finished exchange as the engine saves it, counted against the month. */
    const savedExchange = async (account: TestAccount) => {
      const conversationId = crypto.randomUUID();
      const messageId = crypto.randomUUID();
      const row = { assistant_id: account.assistantId, owner_id: account.userId };

      await service.from('conversations').insert({ id: conversationId, ...row, title: 'Keys' });
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
        content: 'Create keys in Settings [1]. Rotate them monthly [2].',
        citations: [
          { index: 1, documentId: 'd1', title: 'Auth', url: null, snippet: 'a' },
          { index: 2, documentId: 'd2', title: 'Rotation', url: null, snippet: 'b' },
        ],
        answered: true,
      });
      await service.rpc('reserve_message', { owner: account.userId, max_allowed: 1000 });

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
      owner = await createTestAccount(service, 'stop-owner');
      intruder = await createTestAccount(service, 'stop-intruder');
    });

    afterAll(async () => {
      await deleteTestAccount(service, owner);
      await deleteTestAccount(service, intruder);
    });

    it('cuts an answer saved before the stop back to what the reader saw, and gives the slot back', async () => {
      const { conversationId, messageId } = await savedExchange(owner!);
      const before = await usage(owner!);

      signInAs(owner!);

      const response = await post(messageId, {
        assistantId: owner!.assistantId,
        conversationId,
        text: 'Create keys in Settings [1]. Rot',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ stopped: true, answer: 'stopped' });

      const { data: answer } = await service
        .from('messages')
        .select('content, answered, citations')
        .eq('id', messageId)
        .single();

      expect(answer).toEqual({
        content: 'Create keys in Settings [1]. Rot',
        answered: null,
        citations: [{ index: 1, documentId: 'd1', title: 'Auth', url: null, snippet: 'a' }],
      });
      expect(await usage(owner!)).toBe(before - 1);
      expect(await stopRow(messageId)).toMatchObject({ owner_id: owner!.userId });

      // Pressing Stop twice (or a retried request) gives nothing back twice.
      await post(messageId, { assistantId: owner!.assistantId, conversationId, text: 'Create' });
      expect(await usage(owner!)).toBe(before - 1);
    });

    it('records a stop that overtakes its question, for the engine to find', async () => {
      const conversationId = crypto.randomUUID();
      const messageId = crypto.randomUUID();

      signInAs(owner!);

      const response = await post(messageId, {
        assistantId: owner!.assistantId,
        conversationId,
        text: '',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ stopped: true, answer: 'none' });
      expect(await stopRow(messageId)).toEqual({
        conversation_id: conversationId,
        assistant_id: owner!.assistantId,
        owner_id: owner!.userId,
        content: '',
      });
    });

    it("refuses another account's conversation and leaves its answer alone", async () => {
      const { conversationId, messageId } = await savedExchange(owner!);
      const before = await usage(owner!);

      signInAs(intruder!);

      const response = await post(messageId, {
        assistantId: intruder!.assistantId,
        conversationId,
        text: '',
      });

      expect(response.status).toBe(404);
      expect(await stopRow(messageId)).toBeNull();
      expect(
        (await service.from('messages').select('answered').eq('id', messageId).single()).data,
      ).toEqual({ answered: true });
      expect(await usage(owner!)).toBe(before);
    });

    it("refuses a stop filed under another account's assistant", async () => {
      const messageId = crypto.randomUUID();

      signInAs(intruder!);

      const response = await post(messageId, {
        assistantId: owner!.assistantId,
        conversationId: crypto.randomUUID(),
        text: '',
      });

      expect(response.status).toBe(404);
      expect(await stopRow(messageId)).toBeNull();
    });
  },
);
