// @vitest-environment node
import type { ChatStreamEvent, Citation } from '@parbot/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type AiProvider, createStubProvider, type GenerateInput, stubEmbedding } from '@/lib/ai';
import type { Database } from '@/lib/db';

import { type AnswerConversation, streamAnswer } from './answer';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };

type Client = SupabaseClient<Database>;

type Account = { userId: string; assistantId: string; client: Client };

/**
 * Projects against the local database with stub embeddings: a conversation in a project reads the
 * project's files and follows its instructions, moving a conversation in or out changes that from
 * the next question on, nobody can reach into another account's project, and deleting a project
 * keeps its conversations. Throwaway accounts, removed afterwards.
 */
describe.skipIf(!serviceKey || !anonKey)('projects against the local database', () => {
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
  const userIds: string[] = [];
  let owner: Account;
  let stranger: Account;
  let pricingId = '';
  let handbookId = '';
  let strangerSourceId = '';
  let projectId = '';
  let strangerProjectId = '';

  const PRICING_PASSAGE =
    'The team plan costs twelve dollars per seat per month, billed on the first of each month.';
  const INSTRUCTIONS = 'Answer as the billing team. Mention the plan name first.';

  const createAccount = async (label: string): Promise<Account> => {
    const email = `projects-${label}-${stamp}@parbot.test`;
    const password = `pw-${crypto.randomUUID()}`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(error?.message ?? 'no user');
    }

    userIds.push(data.user.id);

    const { data: assistant, error: assistantError } = await service
      .from('assistants')
      .insert({
        owner_id: data.user.id,
        name: `Projects ${label}`,
        slug: `projects-${label}-${stamp}`,
      })
      .select('id')
      .single();

    if (assistantError || !assistant) {
      throw new Error(assistantError?.message ?? 'no assistant');
    }

    const client = createClient<Database>(url, anonKey || 'not-configured', options);
    await client.auth.signInWithPassword({ email, password });

    return { userId: data.user.id, assistantId: assistant.id, client };
  };

  /** A ready source with one indexed passage, embedded the way the stub embeds. */
  const addSource = async (account: Account, title: string, passage: string) => {
    const { data: source } = await service
      .from('sources')
      .insert({
        assistant_id: account.assistantId,
        owner_id: account.userId,
        kind: 'text',
        title,
        storage_path: `${account.userId}/${account.assistantId}/${crypto.randomUUID()}.md`,
        status: 'ready',
      })
      .select('id')
      .single();
    const { data: document } = await service
      .from('documents')
      .insert({
        assistant_id: account.assistantId,
        owner_id: account.userId,
        source_id: source!.id,
        title,
        content: passage,
        checksum: crypto.randomUUID(),
      })
      .select('id')
      .single();

    await service.from('chunks').insert({
      assistant_id: account.assistantId,
      owner_id: account.userId,
      document_id: document!.id,
      position: 0,
      content: passage,
      embedding: JSON.stringify(stubEmbedding(passage)),
    });

    return source!.id;
  };

  const run = async (
    conversation: AnswerConversation,
    message: string,
    extra: { projectId?: string; references?: string[] } = {},
  ) => {
    const events: ChatStreamEvent[] = [];

    for await (const event of streamAnswer({
      service,
      provider,
      assistant: {
        id: owner.assistantId,
        owner_id: owner.userId,
        name: 'Acme Docs',
        instructions: 'Keep answers short.',
      },
      conversation,
      message,
      projectId: extra.projectId,
      references: extra.references,
    })) {
      events.push(event);
    }

    return events;
  };

  const citationsOf = (events: ChatStreamEvent[]): Citation[] => {
    const event = events.find((candidate) => candidate.type === 'citations');

    return event?.type === 'citations' ? event.citations : [];
  };

  const conversationRow = async (id: string) => {
    const { data } = await service
      .from('conversations')
      .select('id, project_id, message_count')
      .eq('id', id)
      .maybeSingle();

    return data;
  };

  beforeAll(async () => {
    owner = await createAccount('owner');
    stranger = await createAccount('stranger');

    pricingId = await addSource(owner, 'Pricing sheet', PRICING_PASSAGE);
    handbookId = await addSource(
      owner,
      'Handbook',
      'API keys are created in Settings under Developer. Rotate a key from the same screen.',
    );
    strangerSourceId = await addSource(
      stranger,
      'Launch plans',
      'The stranger launches on the first of March.',
    );

    // The owner makes the project with their own session, the way the app does.
    projectId = crypto.randomUUID();

    const created = await owner.client.from('chat_projects').insert({
      id: projectId,
      assistant_id: owner.assistantId,
      owner_id: owner.userId,
      name: 'Billing',
      instructions: INSTRUCTIONS,
    });

    expect(created.error).toBeNull();

    const filed = await owner.client
      .from('project_sources')
      .insert({ project_id: projectId, source_id: pricingId, owner_id: owner.userId });

    expect(filed.error).toBeNull();

    strangerProjectId = crypto.randomUUID();
    await stranger.client.from('chat_projects').insert({
      id: strangerProjectId,
      assistant_id: stranger.assistantId,
      owner_id: stranger.userId,
      name: 'Secret',
    });
  });

  afterAll(async () => {
    for (const id of userIds) {
      await service.auth.admin.deleteUser(id);
    }
  });

  it("answers a vague question in a project from the project's file, with its instructions", async () => {
    const conversationId = crypto.randomUUID();
    const events = await run({ id: conversationId, channel: 'app' }, 'What does it say?', {
      projectId,
    });

    expect(events.at(-1)).toMatchObject({ type: 'done', answered: true });
    expect(citationsOf(events)[0]).toMatchObject({ title: 'Pricing sheet' });
    expect((await conversationRow(conversationId))?.project_id).toBe(projectId);

    const prompt = prompts.at(-1)!;

    expect(prompt.turns.at(-1)!.text).toContain('[1] Pricing sheet (referenced)');
    expect(prompt.system).toContain('This conversation belongs to the project "Billing".');
    // The assistant's own instructions come first, the project's after them.
    expect(prompt.system.indexOf('Keep answers short.')).toBeLessThan(
      prompt.system.indexOf(INSTRUCTIONS),
    );
    expect(prompt.system).toContain('Project instructions from the team');

    // The project's files are not stored as the question's own references: they follow the project.
    const { data: question } = await service
      .from('messages')
      .select('source_references')
      .eq('conversation_id', conversationId)
      .eq('role', 'user')
      .single();

    expect(question?.source_references).toEqual([]);

    // A follow-up keeps reading the project's file without naming it.
    const followUp = await run({ id: conversationId, channel: 'app' }, 'And the rest?');

    expect(citationsOf(followUp)[0]).toMatchObject({ title: 'Pricing sheet' });
  });

  it("reads the conversation's own references beside the project's files", async () => {
    const conversationId = crypto.randomUUID();
    const events = await run({ id: conversationId, channel: 'app' }, 'Compare them.', {
      projectId,
      references: [handbookId, pricingId],
    });

    expect(events.at(-1)).toMatchObject({ type: 'done', answered: true });

    const prompt = prompts.at(-1)!;
    const sources = prompt.turns.at(-1)!.text;

    // Both are read, a file that is both the reader's pick and the project's only once.
    expect(sources.match(/Pricing sheet \(referenced\)/g)).toHaveLength(1);
    expect(sources.match(/Handbook \(referenced\)/g)).toHaveLength(1);
    expect(prompt.system).toContain(
      'The reader pointed at these files for this conversation: "Handbook", "Pricing sheet".',
    );
    expect(prompt.system).toContain('This conversation belongs to the project "Billing".');
  });

  it('changes what a conversation reads from the next question when it moves in or out', async () => {
    const conversationId = crypto.randomUUID();
    const outside = await run({ id: conversationId, channel: 'app' }, 'What does it say?');

    expect(outside.at(-1)).toMatchObject({ type: 'done', answered: false });

    const moved = await owner.client
      .from('conversations')
      .update({ project_id: projectId })
      .eq('id', conversationId)
      .select('id');

    expect(moved.error).toBeNull();
    expect(moved.data).toHaveLength(1);

    const inside = await run({ id: conversationId, channel: 'app' }, 'What does it say?');

    expect(inside.at(-1)).toMatchObject({ type: 'done', answered: true });
    expect(citationsOf(inside)[0]).toMatchObject({ title: 'Pricing sheet' });

    await owner.client.from('conversations').update({ project_id: null }).eq('id', conversationId);

    const asked = prompts.length;
    const outAgain = await run({ id: conversationId, channel: 'app' }, 'What does it say?');

    // Nothing matched without the project's file, so the model was not even asked.
    expect(outAgain.at(-1)).toMatchObject({ type: 'done', answered: false });
    expect(prompts).toHaveLength(asked);
  });

  it('keeps an existing conversation in its own project whatever a request names', async () => {
    const conversationId = crypto.randomUUID();

    await run({ id: conversationId, channel: 'app' }, 'Where do I rotate a key?');
    await run({ id: conversationId, channel: 'app' }, 'And then?', { projectId });

    expect((await conversationRow(conversationId))?.project_id).toBeNull();
  });

  it("refuses to start a conversation in another account's project, and creates nothing", async () => {
    const conversationId = crypto.randomUUID();
    const events = await run({ id: conversationId, channel: 'app' }, 'What is the launch date?', {
      projectId: strangerProjectId,
    });

    expect(events).toEqual([
      {
        type: 'error',
        code: 'not_found',
        message:
          'That project no longer exists. Start the chat outside it, or pick another project.',
      },
    ]);
    expect(await conversationRow(conversationId)).toBeNull();
  });

  it("never lets a stranger attach a conversation to another account's project", async () => {
    const conversationId = crypto.randomUUID();

    await service.from('conversations').insert({
      id: conversationId,
      assistant_id: stranger.assistantId,
      owner_id: stranger.userId,
      channel: 'app',
    });

    // Updating their own conversation to point at the owner's project fails on the key, which
    // names the project together with the conversation's assistant.
    const attach = await stranger.client
      .from('conversations')
      .update({ project_id: projectId })
      .eq('id', conversationId);

    expect(attach.error).not.toBeNull();

    // Nor can they start one inside it, or see it at all.
    const start = await stranger.client.from('conversations').insert({
      assistant_id: stranger.assistantId,
      owner_id: stranger.userId,
      channel: 'app',
      project_id: projectId,
    });

    expect(start.error).not.toBeNull();

    const { data: visible } = await stranger.client
      .from('chat_projects')
      .select('id')
      .eq('id', projectId);

    expect(visible).toEqual([]);
    expect((await conversationRow(conversationId))?.project_id).toBeNull();
  });

  it("never lets a file of one account into another account's project", async () => {
    // The stranger's file into the owner's project, by the stranger and by the owner.
    const byStranger = await stranger.client.from('project_sources').insert({
      project_id: projectId,
      source_id: strangerSourceId,
      owner_id: stranger.userId,
    });
    const byOwner = await owner.client.from('project_sources').insert({
      project_id: projectId,
      source_id: strangerSourceId,
      owner_id: owner.userId,
    });
    // The owner's file into the stranger's project.
    const intoStranger = await stranger.client.from('project_sources').insert({
      project_id: strangerProjectId,
      source_id: pricingId,
      owner_id: stranger.userId,
    });
    // A project on the owner's assistant made by the stranger.
    const foreignProject = await stranger.client.from('chat_projects').insert({
      assistant_id: owner.assistantId,
      owner_id: stranger.userId,
      name: 'Intruder',
    });

    for (const attempt of [byStranger, byOwner, intoStranger, foreignProject]) {
      expect(attempt.error).not.toBeNull();
    }

    const { data: files } = await service
      .from('project_sources')
      .select('source_id')
      .eq('project_id', projectId);

    expect(files?.map((row) => row.source_id)).toEqual([pricingId]);
  });

  it('keeps names unique per assistant, whatever the case', async () => {
    const duplicate = await owner.client.from('chat_projects').insert({
      assistant_id: owner.assistantId,
      owner_id: owner.userId,
      name: 'billing',
    });

    expect(duplicate.error?.code).toBe('23505');
  });

  it('keeps the conversations of a deleted project, outside any project', async () => {
    const doomed = crypto.randomUUID();

    await owner.client.from('chat_projects').insert({
      id: doomed,
      assistant_id: owner.assistantId,
      owner_id: owner.userId,
      name: 'Short lived',
    });
    await owner.client
      .from('project_sources')
      .insert({ project_id: doomed, source_id: handbookId, owner_id: owner.userId });

    const conversationId = crypto.randomUUID();

    await run({ id: conversationId, channel: 'app' }, 'Where do I rotate a key?', {
      projectId: doomed,
    });
    expect((await conversationRow(conversationId))?.project_id).toBe(doomed);

    const removed = await owner.client.from('chat_projects').delete().eq('id', doomed);

    expect(removed.error).toBeNull();

    const row = await conversationRow(conversationId);

    expect(row).toMatchObject({ id: conversationId, project_id: null, message_count: 2 });

    // The files are still in Knowledge; only their place in the project is gone.
    const { data: source } = await service.from('sources').select('id').eq('id', handbookId);
    const { data: files } = await service
      .from('project_sources')
      .select('source_id')
      .eq('project_id', doomed);

    expect(source).toHaveLength(1);
    expect(files).toEqual([]);
  });

  it('never puts a widget conversation in a project', async () => {
    const conversationId = crypto.randomUUID();
    const events = await run(
      { id: conversationId, channel: 'widget', visitorId: 'visitor_projects_1234' },
      'Where do I rotate a key?',
      { projectId },
    );

    expect(events.at(-1)).toMatchObject({ type: 'done' });
    expect((await conversationRow(conversationId))?.project_id).toBeNull();

    const forced = await service
      .from('conversations')
      .update({ project_id: projectId })
      .eq('id', conversationId);

    expect(forced.error).not.toBeNull();
  });
});
