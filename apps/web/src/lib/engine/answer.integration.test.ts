// @vitest-environment node
import type { ChatStreamEvent } from '@parbot/shared';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { type AiProvider, createStubProvider, stubEmbedding } from '@/lib/ai';
import type { Database } from '@/lib/db';
import { PLANS, usagePeriodStart } from '@/lib/plans';

import { type AnswerConversation, streamAnswer } from './answer';
import { UNANSWERED_TEXT } from './prompt';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Runs against the local Supabase stack as a throwaway account; skipped where there is none.
describe.skipIf(!serviceKey)('streamAnswer against the local database', () => {
  const service = createClient<Database>(url, serviceKey || 'not-configured', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const provider = createStubProvider();
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let ownerId = '';
  let assistantId = '';

  const assistant = () => ({
    id: assistantId,
    owner_id: ownerId,
    name: 'Test assistant',
    instructions: null,
  });

  const run = async (
    conversation: AnswerConversation,
    message: string,
    options: {
      provider?: AiProvider;
      signal?: AbortSignal;
      onEvent?: (e: ChatStreamEvent) => void;
    } = {},
  ) => {
    const events: ChatStreamEvent[] = [];

    for await (const event of streamAnswer({
      service,
      provider: options.provider ?? provider,
      assistant: assistant(),
      conversation,
      message,
      signal: options.signal,
    })) {
      events.push(event);
      options.onEvent?.(event);
    }

    return events;
  };

  const tokenText = (events: ChatStreamEvent[]) =>
    events.map((event) => (event.type === 'token' ? event.text : '')).join('');

  const usage = async () => {
    const { data } = await service
      .from('usage_counters')
      .select('value')
      .eq('owner_id', ownerId)
      .eq('metric', 'messages')
      .eq('period_start', usagePeriodStart())
      .maybeSingle();

    return Number(data?.value ?? 0);
  };

  const setUsage = async (value: number) => {
    await service
      .from('usage_counters')
      .upsert({ owner_id: ownerId, metric: 'messages', period_start: usagePeriodStart(), value });
  };

  const counts = async (conversationId: string) => {
    const [{ data: conversation }, { count }] = await Promise.all([
      service
        .from('conversations')
        .select('message_count, unanswered_count')
        .eq('id', conversationId)
        .maybeSingle(),
      service
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId),
    ]);

    return { conversation, rows: count ?? 0 };
  };

  /** A provider whose answer fails before any text, like a model that refuses the request. */
  const failing: AiProvider = {
    ...provider,
    stream: async function* () {
      throw new Error('upstream failed');
    },
  };

  beforeAll(async () => {
    const { data: created, error: userError } = await service.auth.admin.createUser({
      email: `answer-${stamp}@test.parbot.dev`,
      password: `pw-${crypto.randomUUID()}`,
      email_confirm: true,
    });

    if (userError || !created.user) {
      throw new Error(userError?.message ?? 'no user');
    }

    ownerId = created.user.id;

    const { data: row, error } = await service
      .from('assistants')
      .insert({ owner_id: ownerId, name: 'Test assistant', slug: `test-${stamp}` })
      .select('id')
      .single();

    if (error || !row) {
      throw new Error(error?.message ?? 'no assistant');
    }

    assistantId = row.id;

    const { data: source } = await service
      .from('sources')
      .insert({
        assistant_id: assistantId,
        owner_id: ownerId,
        kind: 'text',
        title: 'Handbook',
        storage_path: 'x',
        status: 'ready',
      })
      .select('id')
      .single();

    const { data: document } = await service
      .from('documents')
      .insert({
        assistant_id: assistantId,
        owner_id: ownerId,
        source_id: source!.id,
        title: 'Authentication',
        url: 'https://docs.example.com/auth',
        content: 'API keys are created in Settings. Rotate an API key from the same screen.',
        checksum: 'abc',
      })
      .select('id')
      .single();

    const passages = [
      'API keys are created in Settings under Developer. Rotate an API key from the same screen.',
      'Webhooks deliver events as JSON with a signature header you must verify.',
    ];

    await service.from('chunks').insert(
      passages.map((content, position) => ({
        assistant_id: assistantId,
        owner_id: ownerId,
        document_id: document!.id,
        position,
        heading: position === 0 ? 'API keys' : 'Webhooks',
        content,
        embedding: JSON.stringify(stubEmbedding(content)),
      })),
    );
  });

  afterAll(async () => {
    if (ownerId) {
      // Cascades through the profile, the assistant, its conversations and the usage counters.
      await service.auth.admin.deleteUser(ownerId);
    }
  });

  it('streams meta, tokens, citations and done, and persists both messages', async () => {
    const conversationId = crypto.randomUUID();
    const before = await usage();
    const events = await run(
      { id: conversationId, channel: 'app' },
      'Where do I create an API key?',
    );

    const types = events.map((event) => event.type);

    expect(types[0]).toBe('meta');
    expect(types).toContain('token');
    expect(types.at(-2)).toBe('citations');
    expect(types.at(-1)).toBe('done');
    expect(events.at(-1)).toMatchObject({ type: 'done', answered: true });
    expect(events.find((event) => event.type === 'citations')).toMatchObject({
      citations: [{ index: 1, title: 'Authentication' }],
    });

    const text = tokenText(events);
    expect(text).toContain('[1]');

    const { data: messages } = await service
      .from('messages')
      .select('role, content, answered, citations')
      .eq('conversation_id', conversationId)
      .order('created_at');

    expect(messages).toHaveLength(2);
    expect(messages?.[0]).toMatchObject({ role: 'user', content: 'Where do I create an API key?' });
    expect(messages?.[1]).toMatchObject({ role: 'assistant', answered: true, content: text });

    const { data: conversation } = await service
      .from('conversations')
      .select('title, message_count')
      .eq('id', conversationId)
      .single();

    expect(conversation).toMatchObject({
      title: 'Where do I create an API key?',
      message_count: 2,
    });
    expect(await usage()).toBe(before + 1);
  });

  it('answers with the unanswered text when nothing matches', async () => {
    const conversationId = crypto.randomUUID();
    const events = await run(
      { id: conversationId, channel: 'widget', visitorId: 'visitor_12345678' },
      'zzz qqq unrelated gibberish',
    );

    expect(events.at(-1)).toMatchObject({ type: 'done', answered: false });
    expect(tokenText(events)).toBe(UNANSWERED_TEXT);

    const { data: conversation } = await service
      .from('conversations')
      .select('channel, visitor_id, unanswered_count')
      .eq('id', conversationId)
      .single();

    expect(conversation).toMatchObject({
      channel: 'widget',
      visitor_id: 'visitor_12345678',
      unanswered_count: 1,
    });
  });

  it("refuses to write into another assistant's conversation", async () => {
    const conversationId = crypto.randomUUID();
    await service.from('conversations').insert({
      id: conversationId,
      assistant_id: assistantId,
      owner_id: ownerId,
      channel: 'widget',
      visitor_id: 'someone_else_1',
    });

    const events = await run(
      { id: conversationId, channel: 'widget', visitorId: 'visitor_12345678' },
      'hello',
    );

    expect(events).toEqual([{ type: 'error', code: 'not_found', message: expect.any(String) }]);
  });

  it('keeps a stopped exchange as the reader saw it, unmetered', async () => {
    const conversationId = crypto.randomUUID();
    const before = await usage();
    const controller = new AbortController();

    const events = await run(
      { id: conversationId, channel: 'app' },
      'How do I rotate an API key?',
      {
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'token') {
            controller.abort();
          }
        },
      },
    );

    const shown = tokenText(events).trim();
    expect(shown.length).toBeGreaterThan(0);

    const { data: messages } = await service
      .from('messages')
      .select('role, content, answered')
      .eq('conversation_id', conversationId)
      .order('created_at');

    expect(messages).toEqual([
      { role: 'user', content: 'How do I rotate an API key?', answered: null },
      { role: 'assistant', content: shown, answered: null },
    ]);
    expect(await counts(conversationId)).toEqual({
      conversation: { message_count: 2, unanswered_count: 0 },
      rows: 2,
    });
    expect(await usage()).toBe(before);
  });

  it('leaves no conversation behind when the first answer fails before any text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const conversationId = crypto.randomUUID();
    const before = await usage();
    const events = await run(
      { id: conversationId, channel: 'app' },
      'Where do I create an API key?',
      {
        provider: failing,
      },
    );

    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'internal' });
    expect(await counts(conversationId)).toEqual({ conversation: null, rows: 0 });
    expect(await usage()).toBe(before);
  });

  it('moves the counters back when a later question is rolled back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const conversationId = crypto.randomUUID();
    await run({ id: conversationId, channel: 'app' }, 'Where do I create an API key?');
    await run({ id: conversationId, channel: 'app' }, 'zzz qqq unrelated gibberish');

    const events = await run(
      { id: conversationId, channel: 'app' },
      'Where do I rotate an API key from in Settings?',
      { provider: failing },
    );

    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'internal' });
    expect(await counts(conversationId)).toEqual({
      conversation: { message_count: 4, unanswered_count: 1 },
      rows: 4,
    });
  });

  it('lets exactly one of two answers in flight take the last slot of the month', async () => {
    const limit = PLANS.hobby.messagesPerMonth;
    await setUsage(limit - 1);

    const results = await Promise.all([
      run({ id: crypto.randomUUID(), channel: 'app' }, 'Where do I create an API key?'),
      run({ id: crypto.randomUUID(), channel: 'app' }, 'How are webhooks signed?'),
    ]);
    const outcomes = results.map((events) => events.at(-1)?.type ?? 'none').sort();

    expect(outcomes).toEqual(['done', 'error']);
    expect(results.flat().filter((event) => event.type === 'error')).toEqual([
      expect.objectContaining({ code: 'quota_exceeded' }),
    ]);
    expect(await usage()).toBe(limit);

    await setUsage(0);
  });

  it('answers both of two requests that start the same new conversation', async () => {
    const conversationId = crypto.randomUUID();

    const results = await Promise.all([
      run({ id: conversationId, channel: 'app' }, 'Where do I create an API key?'),
      run({ id: conversationId, channel: 'app' }, 'How are webhooks signed?'),
    ]);

    expect(results.map((events) => events.at(-1)?.type)).toEqual(['done', 'done']);
    expect(await counts(conversationId)).toMatchObject({
      conversation: { message_count: 4 },
      rows: 4,
    });
  });
});
