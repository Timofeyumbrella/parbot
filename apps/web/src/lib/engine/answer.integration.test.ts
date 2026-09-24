import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStubProvider, stubEmbedding } from '@/lib/ai';
import type { Database } from '@/lib/db';

import { streamAnswer } from './answer';
import { UNANSWERED_TEXT } from './prompt';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_USER = '00000000-0000-4000-8000-000000000001';

// Runs against the local Supabase stack; skipped where there is none.
describe.skipIf(!serviceKey)('streamAnswer against the local database', () => {
  let service: ReturnType<typeof createClient<Database>>;
  const provider = createStubProvider();
  let assistantId = '';

  beforeAll(async () => {
    service = createClient<Database>(url, serviceKey ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: assistant, error } = await service
      .from('assistants')
      .insert({ owner_id: DEMO_USER, name: 'Test assistant', slug: `test-${Date.now()}` })
      .select('id')
      .single();

    if (error || !assistant) {
      throw new Error(error?.message ?? 'no assistant');
    }

    assistantId = assistant.id;

    const { data: source } = await service
      .from('sources')
      .insert({ assistant_id: assistantId, owner_id: DEMO_USER, kind: 'text', title: 'Handbook', storage_path: 'x', status: 'ready' })
      .select('id')
      .single();

    const { data: document } = await service
      .from('documents')
      .insert({
        assistant_id: assistantId,
        owner_id: DEMO_USER,
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
        owner_id: DEMO_USER,
        document_id: document!.id,
        position,
        heading: position === 0 ? 'API keys' : 'Webhooks',
        content,
        embedding: JSON.stringify(stubEmbedding(content)),
      })),
    );
  });

  afterAll(async () => {
    if (assistantId) {
      await service.from('assistants').delete().eq('id', assistantId);
    }
  });

  it('streams meta, tokens, citations and done, and persists both messages', async () => {
    const conversationId = crypto.randomUUID();
    const events = [];

    for await (const event of streamAnswer({
      service,
      provider,
      assistant: { id: assistantId, owner_id: DEMO_USER, name: 'Test assistant', instructions: null },
      conversation: { id: conversationId, channel: 'app' },
      message: 'Where do I create an API key?',
    })) {
      events.push(event);
    }

    const types = events.map((event) => event.type);

    expect(types[0]).toBe('meta');
    expect(types).toContain('token');
    expect(types.at(-2)).toBe('citations');
    expect(types.at(-1)).toBe('done');

    const done = events.at(-1);
    expect(done).toMatchObject({ type: 'done', answered: true });

    const citations = events.find((event) => event.type === 'citations');
    expect(citations).toMatchObject({ citations: [{ index: 1, title: 'Authentication' }] });

    const text = events
      .filter((event) => event.type === 'token')
      .map((event) => (event.type === 'token' ? event.text : ''))
      .join('');
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

    expect(conversation).toMatchObject({ title: 'Where do I create an API key?', message_count: 2 });

    const { data: usage } = await service
      .from('usage_counters')
      .select('value')
      .eq('owner_id', DEMO_USER)
      .eq('metric', 'messages');

    expect(Number(usage?.[0]?.value ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it('answers with the unanswered text when nothing matches', async () => {
    const conversationId = crypto.randomUUID();
    const events = [];

    for await (const event of streamAnswer({
      service,
      provider,
      assistant: { id: assistantId, owner_id: DEMO_USER, name: 'Test assistant', instructions: null },
      conversation: { id: conversationId, channel: 'widget', visitorId: 'visitor_12345678' },
      message: 'zzz qqq unrelated gibberish',
    })) {
      events.push(event);
    }

    expect(events.at(-1)).toMatchObject({ type: 'done', answered: false });
    const text = events
      .filter((event) => event.type === 'token')
      .map((event) => (event.type === 'token' ? event.text : ''))
      .join('');
    expect(text).toBe(UNANSWERED_TEXT);

    const { data: conversation } = await service
      .from('conversations')
      .select('channel, visitor_id, unanswered_count')
      .eq('id', conversationId)
      .single();

    expect(conversation).toMatchObject({ channel: 'widget', visitor_id: 'visitor_12345678', unanswered_count: 1 });
  });

  it('refuses to write into another assistant\'s conversation', async () => {
    const conversationId = crypto.randomUUID();
    await service.from('conversations').insert({
      id: conversationId,
      assistant_id: assistantId,
      owner_id: DEMO_USER,
      channel: 'widget',
      visitor_id: 'someone_else_1',
    });

    const events = [];

    for await (const event of streamAnswer({
      service,
      provider,
      assistant: { id: assistantId, owner_id: DEMO_USER, name: 'Test assistant', instructions: null },
      conversation: { id: conversationId, channel: 'widget', visitorId: 'visitor_12345678' },
      message: 'hello',
    })) {
      events.push(event);
    }

    expect(events).toEqual([{ type: 'error', code: 'not_found', message: expect.any(String) }]);
  });
});
