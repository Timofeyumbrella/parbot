// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../src/lib/db/types';
import { countHistory, deleteOldHistory, loadKnowledge } from './demo-store';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * What --refresh-history deletes, against the local database with throwaway accounts (never the
 * demo): every kind of history row of one assistant except the rows just seeded, and nothing of
 * its knowledge, its settings or another account.
 */
describe.skipIf(!serviceKey)('deleting the demo history', () => {
  const service = createClient<Database>(url, serviceKey || 'not-configured', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const userIds: string[] = [];

  const account = async (label: string) => {
    const { data, error } = await service.auth.admin.createUser({
      email: `demo-store-${label}-${stamp}@parbot.test`,
      password: `pw-${crypto.randomUUID()}`,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(error?.message ?? 'no user');
    }

    userIds.push(data.user.id);

    const { data: assistant, error: assistantError } = await service
      .from('assistants')
      .insert({ owner_id: data.user.id, name: `Store ${label}`, slug: `store-${label}-${stamp}` })
      .select('id, public_key')
      .single();

    if (assistantError || !assistant) {
      throw new Error(assistantError?.message ?? 'no assistant');
    }

    return { ownerId: data.user.id, assistantId: assistant.id, publicKey: assistant.public_key };
  };

  let demo: Awaited<ReturnType<typeof account>>;
  let other: Awaited<ReturnType<typeof account>>;
  let sourceId: string;
  let otherConversation: string;
  const kept = { conversations: [] as string[], leads: [] as string[] };

  const conversation = async (
    owner: typeof demo,
    fields: Partial<Database['public']['Tables']['conversations']['Insert']> = {},
  ) => {
    const { data, error } = await service
      .from('conversations')
      .insert({ assistant_id: owner.assistantId, owner_id: owner.ownerId, ...fields })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'no conversation');
    }

    const { error: messageError } = await service.from('messages').insert(
      (['user', 'assistant'] as const).map((role) => ({
        conversation_id: data.id,
        assistant_id: owner.assistantId,
        owner_id: owner.ownerId,
        role,
        content: `${role} line`,
      })),
      { defaultToNull: false },
    );

    if (messageError) {
      throw new Error(messageError.message);
    }

    return data.id;
  };

  beforeAll(async () => {
    [demo, other] = await Promise.all([account('demo'), account('other')]);

    const owned = { assistant_id: demo.assistantId, owner_id: demo.ownerId };
    const { data: source } = await service
      .from('sources')
      .insert({ ...owned, kind: 'url', title: 'docs', uri: 'https://docs.acme.test' })
      .select('id')
      .single();

    sourceId = source!.id;

    // The old history: a widget chat with a stop and a lead, an in-app chat with a reference, a
    // chat in a project with a file, a stop that never got its conversation, a lead of its own.
    const widget = await conversation(demo, { channel: 'widget', visitor_id: 'v1' });
    const referenced = await conversation(demo, { channel: 'app' });
    const { data: project } = await service
      .from('chat_projects')
      .insert({ ...owned, name: 'Launch' })
      .select('id')
      .single();

    await conversation(demo, { channel: 'app', project_id: project!.id });
    await service
      .from('project_sources')
      .insert({ project_id: project!.id, source_id: sourceId, owner_id: demo.ownerId });
    await service
      .from('conversation_references')
      .insert({ ...owned, conversation_id: referenced, source_id: sourceId });
    await service.from('message_stops').insert([
      { ...owned, message_id: crypto.randomUUID(), conversation_id: widget },
      { ...owned, message_id: crypto.randomUUID(), conversation_id: crypto.randomUUID() },
    ]);
    await service.from('leads').insert([
      { ...owned, conversation_id: widget, email: 'old@acme.test' },
      { ...owned, email: 'loose@acme.test' },
    ]);

    // The history just seeded, which stays.
    const fresh = await conversation(demo, { channel: 'widget', visitor_id: 'v2' });
    const { data: lead } = await service
      .from('leads')
      .insert({ ...owned, conversation_id: fresh, email: 'new@acme.test' })
      .select('id')
      .single();

    kept.conversations.push(fresh);
    kept.leads.push(lead!.id);

    // Another account's history, which is none of the refresh's business.
    otherConversation = await conversation(other, { channel: 'widget', visitor_id: 'v3' });
  });

  afterAll(async () => {
    for (const id of userIds) {
      await service.auth.admin.deleteUser(id);
    }
  });

  it('counts every kind of history row before it goes', async () => {
    expect(await countHistory(service, demo.assistantId)).toEqual({
      conversations: 4,
      messages: 8,
      stops: 2,
      references: 1,
      leads: 3,
      projects: 1,
    });
  });

  it('deletes everything but the rows just seeded, and keeps the knowledge and the key', async () => {
    expect(await deleteOldHistory(service, demo.assistantId, kept)).toBe(1);

    expect(await countHistory(service, demo.assistantId)).toEqual({
      conversations: 1,
      messages: 2,
      stops: 0,
      references: 0,
      leads: 1,
      projects: 0,
    });

    const [conversations, leads, projectFiles, source, assistant, others] = await Promise.all([
      service.from('conversations').select('id').eq('assistant_id', demo.assistantId),
      service.from('leads').select('id').eq('assistant_id', demo.assistantId),
      service.from('project_sources').select('source_id').eq('owner_id', demo.ownerId),
      service.from('sources').select('id').eq('id', sourceId).maybeSingle(),
      service.from('assistants').select('public_key').eq('id', demo.assistantId).single(),
      service.from('conversations').select('id').eq('assistant_id', other.assistantId),
    ]);

    expect(conversations.data?.map(({ id }) => id)).toEqual(kept.conversations);
    expect(leads.data?.map(({ id }) => id)).toEqual(kept.leads);
    expect(projectFiles.data).toEqual([]);
    expect(source.data?.id).toBe(sourceId);
    expect(assistant.data?.public_key).toBe(demo.publicKey);
    expect(others.data?.map(({ id }) => id)).toEqual([otherConversation]);
  });
});

/**
 * What the seed re-points saved citations against: every indexed page of the assistant, even past
 * the 1,000 rows PostgREST returns at most. A page left out would send its citations to another
 * page with the same title.
 */
describe.skipIf(!serviceKey)('loading the demo knowledge', () => {
  const service = createClient<Database>(url, serviceKey || 'not-configured', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const PAGES = 1_205;
  let ownerId: string;
  let assistantId: string;
  const ids = new Set<string>();

  beforeAll(async () => {
    const { data, error } = await service.auth.admin.createUser({
      email: `demo-store-knowledge-${stamp}@parbot.test`,
      password: `pw-${crypto.randomUUID()}`,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(error?.message ?? 'no user');
    }

    ownerId = data.user.id;

    const { data: assistant } = await service
      .from('assistants')
      .insert({ owner_id: ownerId, name: 'Crawled', slug: `crawled-${stamp}` })
      .select('id')
      .single();

    assistantId = assistant!.id;

    const owned = { assistant_id: assistantId, owner_id: ownerId };
    const { data: source } = await service
      .from('sources')
      .insert({ ...owned, kind: 'url', title: 'docs', uri: 'https://docs.acme.test' })
      .select('id')
      .single();
    // A crawled site names many of its pages alike.
    const { data: documents, error: insertError } = await service
      .from('documents')
      .insert(
        Array.from({ length: PAGES }, (_, index) => ({
          ...owned,
          source_id: source!.id,
          url: `https://docs.acme.test/${index}/overview`,
          title: 'Overview',
          content: `Page ${index}`,
          checksum: `checksum-${index}`,
        })),
      )
      .select('id');

    if (insertError) {
      throw new Error(insertError.message);
    }

    for (const { id } of documents ?? []) {
      ids.add(id);
    }
  }, 60_000);

  afterAll(async () => {
    if (ownerId) {
      await service.auth.admin.deleteUser(ownerId);
    }
  });

  it('reads every page, past the 1,000 rows one response carries', async () => {
    expect(ids.size).toBe(PAGES);

    const { documents } = await loadKnowledge(service, assistantId);

    expect(documents).toHaveLength(PAGES);
    expect(new Set(documents.map(({ id }) => id))).toEqual(ids);
    expect(documents[0]).toMatchObject({
      title: 'Overview',
      url: expect.stringMatching(/overview$/),
    });
  });
});
