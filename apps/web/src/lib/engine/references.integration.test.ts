// @vitest-environment node
import type { ChatStreamEvent, Citation } from '@parbot/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type AiProvider, createStubProvider, type GenerateInput, stubEmbedding } from '@/lib/ai';
import type { Database } from '@/lib/db';

import { type AnswerConversation, streamAnswer } from './answer';
import { UNANSWERED_TEXT } from './prompt';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };

type Client = SupabaseClient<Database>;

/**
 * References against the local database with stub embeddings: a referenced file is read even when
 * the question shares no words with it, the conversation keeps its references for follow-ups, and
 * nothing outside the assistant can be referenced. Throwaway accounts, removed afterwards.
 */
describe.skipIf(!serviceKey || !anonKey)('references against the local database', () => {
  const service: Client = createClient<Database>(url, serviceKey || 'not-configured', options);
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const prompts: GenerateInput[] = [];
  const stub = createStubProvider();
  const provider: AiProvider = {
    ...stub,
    stream: (input) => {
      prompts.push(input);

      return stub.stream(input);
    },
  };
  const owners: string[] = [];
  let ownerId = '';
  let assistantId = '';
  let ownerClient: Client;
  let handbookId = '';
  let limitsId = '';
  let limitsDocumentId = '';
  let foreignSourceId = '';
  let foreignAssistantId = '';

  const LIMITS_PASSAGE =
    'Each workspace holds at most five projects. Exports run once per day, at midnight UTC.';

  const createAccount = async (label: string) => {
    const email = `refs-${label}-${stamp}@parbot.test`;
    const password = `pw-${crypto.randomUUID()}`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(error?.message ?? 'no user');
    }

    owners.push(data.user.id);

    const { data: assistant, error: assistantError } = await service
      .from('assistants')
      .insert({ owner_id: data.user.id, name: `Refs ${label}`, slug: `refs-${label}-${stamp}` })
      .select('id')
      .single();

    if (assistantError || !assistant) {
      throw new Error(assistantError?.message ?? 'no assistant');
    }

    const client = createClient<Database>(url, anonKey || 'not-configured', options);
    await client.auth.signInWithPassword({ email, password });

    return { userId: data.user.id, assistantId: assistant.id, client };
  };

  /** A source with one indexed document whose passages are embedded the way the stub embeds. */
  const addSource = async (
    owner: { userId: string; assistantId: string },
    input: {
      kind: 'text' | 'upload';
      title: string;
      passages: string[];
      status?: Database['public']['Enums']['source_status'];
    },
  ) => {
    const { data: source, error } = await service
      .from('sources')
      .insert({
        assistant_id: owner.assistantId,
        owner_id: owner.userId,
        kind: input.kind,
        title: input.title,
        storage_path: `${owner.userId}/${owner.assistantId}/${crypto.randomUUID()}.md`,
        status: input.status ?? 'ready',
      })
      .select('id')
      .single();

    if (error || !source) {
      throw new Error(error?.message ?? 'no source');
    }

    if (input.passages.length === 0) {
      return { sourceId: source.id, documentId: '' };
    }

    const documentId = await addDocument(owner, source.id, input.title, input.passages);

    return { sourceId: source.id, documentId };
  };

  const addDocument = async (
    owner: { userId: string; assistantId: string },
    sourceId: string,
    title: string,
    passages: string[],
  ) => {
    const { data: document } = await service
      .from('documents')
      .insert({
        assistant_id: owner.assistantId,
        owner_id: owner.userId,
        source_id: sourceId,
        title,
        content: passages.join('\n\n'),
        checksum: crypto.randomUUID(),
      })
      .select('id')
      .single();

    await service.from('chunks').insert(
      passages.map((content, position) => ({
        assistant_id: owner.assistantId,
        owner_id: owner.userId,
        document_id: document!.id,
        position,
        content,
        embedding: JSON.stringify(stubEmbedding(content)),
      })),
    );

    return document!.id;
  };

  const run = async (
    conversation: AnswerConversation,
    message: string,
    extra: {
      references?: string[];
      referenceWaitMs?: number;
      onEvent?: (event: ChatStreamEvent) => void | Promise<void>;
    } = {},
  ) => {
    const events: ChatStreamEvent[] = [];

    for await (const event of streamAnswer({
      service,
      provider,
      assistant: { id: assistantId, owner_id: ownerId, name: 'Refs', instructions: null },
      conversation,
      message,
      references: extra.references,
      referenceWaitMs: extra.referenceWaitMs,
    })) {
      events.push(event);
      await extra.onEvent?.(event);
    }

    return events;
  };

  const citationsOf = (events: ChatStreamEvent[]): Citation[] => {
    const event = events.find((candidate) => candidate.type === 'citations');

    return event?.type === 'citations' ? event.citations : [];
  };

  const storedReferences = async (conversationId: string) => {
    const { data } = await service
      .from('conversation_references')
      .select('source_id, position')
      .eq('conversation_id', conversationId)
      .order('position');

    return (data ?? []).map((row) => row.source_id);
  };

  const userMessages = async (conversationId: string) => {
    const { data } = await service
      .from('messages')
      .select('content, source_references')
      .eq('conversation_id', conversationId)
      .eq('role', 'user')
      .order('created_at');

    return data ?? [];
  };

  beforeAll(async () => {
    const owner = await createAccount('owner');

    ownerId = owner.userId;
    assistantId = owner.assistantId;
    ownerClient = owner.client;

    ({ sourceId: handbookId } = await addSource(owner, {
      kind: 'text',
      title: 'Handbook',
      passages: [
        'API keys are created in Settings under Developer. Rotate an API key from the same screen.',
      ],
    }));
    ({ sourceId: limitsId, documentId: limitsDocumentId } = await addSource(owner, {
      kind: 'upload',
      title: 'limits.md',
      passages: [LIMITS_PASSAGE, 'Contact support to raise a limit for a single workspace.'],
    }));

    const stranger = await createAccount('stranger');

    foreignAssistantId = stranger.assistantId;
    ({ sourceId: foreignSourceId } = await addSource(stranger, {
      kind: 'text',
      title: 'Secret plans',
      passages: ['The stranger keeps their launch date here: the first of March.'],
    }));
  });

  afterAll(async () => {
    for (const id of owners) {
      await service.auth.admin.deleteUser(id);
    }
  });

  it('reads a referenced file even when the question shares no words with it', async () => {
    // Without a reference the vague question matches nothing and is not answered.
    const plain = await run({ id: crypto.randomUUID(), channel: 'app' }, 'What does it say?');

    expect(plain.at(-1)).toMatchObject({ type: 'done', answered: false });

    const conversationId = crypto.randomUUID();
    const events = await run({ id: conversationId, channel: 'app' }, 'What does it say?', {
      references: [limitsId],
    });

    expect(events.at(-1)).toMatchObject({ type: 'done', answered: true });
    expect(citationsOf(events)).toEqual([
      expect.objectContaining({
        index: 1,
        documentId: limitsDocumentId,
        title: 'limits.md',
        url: null,
        chunkId: expect.any(String),
      }),
    ]);

    // The model is told which file "it" means, and the passage is marked as the reader's pick.
    const prompt = prompts.at(-1)!;

    expect(prompt.system).toContain('"limits.md"');
    expect(prompt.turns.at(-1)!.text).toContain('[1] limits.md (referenced)');

    const { data: chunk } = await service
      .from('chunks')
      .select('content')
      .eq('id', citationsOf(events)[0]!.chunkId!)
      .single();

    expect(chunk?.content).toBe(LIMITS_PASSAGE);
    expect(await storedReferences(conversationId)).toEqual([limitsId]);
    expect(await userMessages(conversationId)).toEqual([
      {
        content: 'What does it say?',
        source_references: [{ id: limitsId, title: 'limits.md', kind: 'upload' }],
      },
    ]);
  });

  it('keeps the references for a follow-up that names none, and clears them on an empty list', async () => {
    const conversationId = crypto.randomUUID();

    await run({ id: conversationId, channel: 'app' }, 'Summarise this file.', {
      references: [limitsId],
    });

    const followUp = await run({ id: conversationId, channel: 'app' }, 'And what else?');

    expect(followUp.at(-1)).toMatchObject({ type: 'done', answered: true });
    expect(citationsOf(followUp)[0]).toMatchObject({ documentId: limitsDocumentId });
    expect((await userMessages(conversationId)).map((row) => row.source_references)).toEqual([
      [{ id: limitsId, title: 'limits.md', kind: 'upload' }],
      [{ id: limitsId, title: 'limits.md', kind: 'upload' }],
    ]);

    const cleared = await run({ id: conversationId, channel: 'app' }, 'Anything more?', {
      references: [],
    });

    expect(cleared.at(-1)).toMatchObject({ type: 'done', answered: false });
    expect(await storedReferences(conversationId)).toEqual([]);
    expect((await userMessages(conversationId)).at(-1)?.source_references).toEqual([]);
  });

  it('replaces the references with the list a question sends, in its order', async () => {
    const conversationId = crypto.randomUUID();

    await run({ id: conversationId, channel: 'app' }, 'Compare them.', {
      references: [limitsId, handbookId],
    });

    expect(await storedReferences(conversationId)).toEqual([limitsId, handbookId]);

    await run({ id: conversationId, channel: 'app' }, 'Only the handbook now.', {
      references: [handbookId],
    });

    expect(await storedReferences(conversationId)).toEqual([handbookId]);
  });

  it("leaves out sources that are not the assistant's own", async () => {
    const conversationId = crypto.randomUUID();
    const events = await run({ id: conversationId, channel: 'app' }, 'What is the launch date?', {
      references: [foreignSourceId, limitsId, crypto.randomUUID()],
    });

    expect(await storedReferences(conversationId)).toEqual([limitsId]);
    expect(JSON.stringify(events)).not.toContain('March');
    expect(prompts.at(-1)!.turns.at(-1)!.text).not.toContain('Secret plans');
  });

  it('waits for a file that is still indexing, then answers from it', async () => {
    const owner = { userId: ownerId, assistantId };
    const { sourceId } = await addSource(owner, {
      kind: 'upload',
      title: 'pricing.pdf',
      passages: [],
      status: 'indexing',
    });
    const conversationId = crypto.randomUUID();
    let statusSeenAt = 0;

    const events = await run({ id: conversationId, channel: 'app' }, 'What does this say?', {
      references: [sourceId],
      referenceWaitMs: 10_000,
      onEvent: async (event) => {
        if (event.type === 'status') {
          statusSeenAt = Date.now();
          // Indexing finishes while the answer waits.
          await addDocument(owner, sourceId, 'pricing.pdf', [
            'The team plan costs twelve dollars per seat per month.',
          ]);
          await service.from('sources').update({ status: 'ready' }).eq('id', sourceId);
        }
      },
    });

    expect(statusSeenAt).toBeGreaterThan(0);
    expect(events.map((event) => event.type).slice(0, 2)).toEqual(['meta', 'status']);
    expect(events[1]).toEqual({ type: 'status', message: 'Reading pricing.pdf…' });
    expect(events.at(-1)).toMatchObject({ type: 'done', answered: true });
    expect(citationsOf(events)[0]).toMatchObject({ title: 'pricing.pdf' });
  });

  it('answers from what is ready when the wait runs out', async () => {
    const { sourceId } = await addSource(
      { userId: ownerId, assistantId },
      { kind: 'upload', title: 'slow.pdf', passages: [], status: 'queued' },
    );
    const startedAt = Date.now();
    const events = await run({ id: crypto.randomUUID(), channel: 'app' }, 'What does it say?', {
      references: [sourceId, limitsId],
      referenceWaitMs: 300,
    });

    expect(Date.now() - startedAt).toBeLessThan(5_000);
    expect(events[1]).toEqual({ type: 'status', message: 'Reading slow.pdf…' });
    expect(citationsOf(events)[0]).toMatchObject({ title: 'limits.md' });
  });

  it('ignores references on the widget and sends it no passage ids', async () => {
    const conversationId = crypto.randomUUID();
    const events = await run(
      { id: conversationId, channel: 'widget', visitorId: 'visitor_refs_1234' },
      'Where do I create an API key?',
      { references: [limitsId] },
    );

    expect(await storedReferences(conversationId)).toEqual([]);
    expect(citationsOf(events)[0]).toMatchObject({ title: 'Handbook' });
    expect(citationsOf(events)[0]).not.toHaveProperty('chunkId');

    // The saved answer keeps the passage, so the owner can open it from the Inbox.
    const { data } = await service
      .from('messages')
      .select('citations')
      .eq('conversation_id', conversationId)
      .eq('role', 'assistant')
      .single();

    expect((data?.citations as Citation[])[0]).toHaveProperty('chunkId');
  });

  it('matches passages within sources round robin, whatever the similarity', async () => {
    const { data, error } = await service.rpc('match_chunks_in_sources', {
      assistant: assistantId,
      query_embedding: JSON.stringify(stubEmbedding('zzz nothing in common')),
      source_ids: [limitsId, handbookId, foreignSourceId],
      per_source: 4,
    });

    expect(error).toBeNull();
    // Every source's best first, then the second best; the other account's source is not read.
    expect(data?.map((row) => [row.source_id, row.source_rank])).toEqual(
      expect.arrayContaining([
        [limitsId, 1],
        [handbookId, 1],
        [limitsId, 2],
      ]),
    );
    expect(data?.map((row) => row.source_rank)).toEqual([1, 1, 2]);
    expect(data?.some((row) => row.source_id === foreignSourceId)).toBe(false);
  });

  it('lets owners store references only between their own conversations and sources', async () => {
    const conversationId = crypto.randomUUID();

    await service.from('conversations').insert({
      id: conversationId,
      assistant_id: assistantId,
      owner_id: ownerId,
      channel: 'app',
    });

    const own = await ownerClient.from('conversation_references').insert({
      conversation_id: conversationId,
      source_id: limitsId,
      assistant_id: assistantId,
      owner_id: ownerId,
    });

    expect(own.error).toBeNull();

    const foreign = await ownerClient.from('conversation_references').insert({
      conversation_id: conversationId,
      source_id: foreignSourceId,
      assistant_id: assistantId,
      owner_id: ownerId,
    });

    expect(foreign.error).not.toBeNull();

    const intoForeignAssistant = await ownerClient.from('conversation_references').insert({
      conversation_id: conversationId,
      source_id: limitsId,
      assistant_id: foreignAssistantId,
      owner_id: ownerId,
    });

    expect(intoForeignAssistant.error).not.toBeNull();

    // A deleted source leaves the conversations that referenced it.
    const { sourceId } = await addSource(
      { userId: ownerId, assistantId },
      { kind: 'text', title: 'Temporary', passages: ['Short lived.'] },
    );

    await ownerClient.from('conversation_references').insert({
      conversation_id: conversationId,
      source_id: sourceId,
      assistant_id: assistantId,
      owner_id: ownerId,
    });
    await service.from('sources').delete().eq('id', sourceId);

    expect(await storedReferences(conversationId)).toEqual([limitsId]);
  });

  it('answers without a reference whose source is gone', async () => {
    const events = await run({ id: crypto.randomUUID(), channel: 'app' }, 'What does it say?', {
      references: [crypto.randomUUID()],
    });

    expect(events.at(-1)).toMatchObject({ type: 'done', answered: false });
    expect(
      events
        .map((event) => (event.type === 'token' ? event.text : ''))
        .join('')
        .trim(),
    ).toBe(UNANSWERED_TEXT);
  });
});
