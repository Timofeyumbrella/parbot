// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/db';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Client = SupabaseClient<Database>;

const PERMISSION_DENIED = '42501';

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

/**
 * Row level security, exercised the way the app reaches the database: two throwaway accounts
 * signed in through the anon key, each trying to read and write the other's rows. A migration
 * that drops or loosens a policy fails here instead of shipping.
 */
describe.skipIf(!serviceKey || !anonKey)('row level security against the local database', () => {
  const service = createClient<Database>(url, serviceKey || 'not-configured', clientOptions);
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  type Account = {
    id: string;
    client: Client;
    assistantId: string;
    conversationId: string;
    messageId: string;
    sourceId: string;
    leadId: string;
  };

  /** Recorded as soon as each user exists, so a failed setup still cleans up. */
  const userIds: string[] = [];
  const clients: Client[] = [];
  let owner: Account;
  let intruder: Account;

  /** A user with one of everything, written by the service role, then signed in as themselves. */
  const createAccount = async (label: string): Promise<Account> => {
    const email = `rls-${label}-${stamp}@test.parbot.dev`;
    const password = `pw-${crypto.randomUUID()}`;
    const { data: created, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !created.user) {
      throw new Error(error?.message ?? 'no user');
    }

    const id = created.user.id;
    userIds.push(id);

    const { data: assistant } = await service
      .from('assistants')
      .insert({ owner_id: id, name: `RLS ${label}`, slug: `rls-${label}-${stamp}` })
      .select('id')
      .single();
    const assistantId = assistant!.id;

    const { data: source } = await service
      .from('sources')
      .insert({
        assistant_id: assistantId,
        owner_id: id,
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
        owner_id: id,
        source_id: source!.id,
        title: 'Page',
        content: 'Private content.',
        checksum: 'abc',
      })
      .select('id')
      .single();
    await service.from('chunks').insert({
      assistant_id: assistantId,
      owner_id: id,
      document_id: document!.id,
      position: 0,
      content: 'Private content.',
      embedding: JSON.stringify(Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0))),
    });

    const conversationId = crypto.randomUUID();
    await service.from('conversations').insert({
      id: conversationId,
      assistant_id: assistantId,
      owner_id: id,
      channel: 'app',
      title: 'Private question',
    });
    const { data: message } = await service
      .from('messages')
      .insert({
        conversation_id: conversationId,
        assistant_id: assistantId,
        owner_id: id,
        role: 'assistant',
        content: 'Private answer.',
        answered: true,
      })
      .select('id')
      .single();
    const { data: lead } = await service
      .from('leads')
      .insert({
        assistant_id: assistantId,
        owner_id: id,
        conversation_id: conversationId,
        email: 'visitor@example.com',
      })
      .select('id')
      .single();
    await service.rpc('increment_usage', { owner: id, usage: 'messages', delta: 3 });

    const client = createClient<Database>(url, anonKey || 'not-configured', clientOptions);
    clients.push(client);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });

    if (signInError) {
      throw new Error(signInError.message);
    }

    return {
      id,
      client,
      assistantId,
      conversationId,
      messageId: message!.id,
      sourceId: source!.id,
      leadId: lead!.id,
    };
  };

  beforeAll(async () => {
    owner = await createAccount('owner');
    intruder = await createAccount('intruder');
  });

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.auth.signOut({ scope: 'local' })));

    for (const id of userIds) {
      // Cascades through every row created above.
      await service.auth.admin.deleteUser(id);
    }
  });

  it('shows a signed-in account its own rows', async () => {
    const { client, id, assistantId } = owner;

    const [assistants, conversations, messages, profile, subscription] = await Promise.all([
      client.from('assistants').select('id').eq('id', assistantId),
      client.from('conversations').select('id').eq('assistant_id', assistantId),
      client.from('messages').select('id').eq('assistant_id', assistantId),
      client.from('profiles').select('id'),
      client.from('subscriptions').select('account_id'),
    ]);

    expect(assistants.data).toHaveLength(1);
    expect(conversations.data).toHaveLength(1);
    expect(messages.data).toHaveLength(1);
    expect(profile.data).toEqual([{ id }]);
    expect(subscription.data).toEqual([{ account_id: id }]);
  });

  it("hides another account's assistant", async () => {
    const { data, error } = await intruder.client
      .from('assistants')
      .select('id')
      .eq('id', owner.assistantId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it.each(['sources', 'documents', 'chunks', 'conversations', 'messages', 'leads'] as const)(
    "hides another account's %s",
    async (table) => {
      const { data, error } = await intruder.client
        .from(table)
        .select('id')
        .eq('assistant_id', owner.assistantId);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    },
  );

  it("hides another account's profile, subscription and usage", async () => {
    const [profiles, subscriptions, usage] = await Promise.all([
      intruder.client.from('profiles').select('id').eq('id', owner.id),
      intruder.client.from('subscriptions').select('account_id').eq('account_id', owner.id),
      intruder.client.from('usage_counters').select('value').eq('owner_id', owner.id),
    ]);

    expect(profiles.data).toEqual([]);
    expect(subscriptions.data).toEqual([]);
    expect(usage.data).toEqual([]);
  });

  it("refuses rows that point at another account's assistant, even with the caller as owner", async () => {
    const conversation = await intruder.client.from('conversations').insert({
      assistant_id: owner.assistantId,
      owner_id: intruder.id,
      channel: 'app',
    });
    const source = await intruder.client.from('sources').insert({
      assistant_id: owner.assistantId,
      owner_id: intruder.id,
      kind: 'text',
      title: 'Planted',
    });
    const moved = await intruder.client
      .from('conversations')
      .update({ assistant_id: owner.assistantId })
      .eq('id', intruder.conversationId);

    expect(conversation.error?.code).toBe(PERMISSION_DENIED);
    expect(source.error?.code).toBe(PERMISSION_DENIED);
    expect(moved.error?.code).toBe(PERMISSION_DENIED);

    // The same insert into the caller's own assistant goes through, so the refusal above is the policy.
    const own = await intruder.client.from('conversations').insert({
      assistant_id: intruder.assistantId,
      owner_id: intruder.id,
      channel: 'app',
    });

    expect(own.error).toBeNull();
  });

  it('refuses inserts the app never makes as a user', async () => {
    const message = await intruder.client.from('messages').insert({
      conversation_id: intruder.conversationId,
      assistant_id: intruder.assistantId,
      owner_id: intruder.id,
      role: 'user',
      content: 'Written from the browser',
    });
    const lead = await intruder.client.from('leads').insert({
      assistant_id: owner.assistantId,
      owner_id: owner.id,
      email: 'planted@example.com',
    });

    expect(message.error?.code).toBe(PERMISSION_DENIED);
    expect(lead.error?.code).toBe(PERMISSION_DENIED);
  });

  it("changes and deletes nothing of another account's", async () => {
    const results = await Promise.all([
      intruder.client
        .from('conversations')
        .update({ title: 'Renamed' })
        .eq('id', owner.conversationId)
        .select('id'),
      intruder.client
        .from('messages')
        .update({ feedback: -1 })
        .eq('id', owner.messageId)
        .select('id'),
      intruder.client
        .from('leads')
        .update({ status: 'closed' })
        .eq('id', owner.leadId)
        .select('id'),
      intruder.client
        .from('assistants')
        .update({ name: 'Taken' })
        .eq('id', owner.assistantId)
        .select('id'),
      intruder.client.from('sources').delete().eq('id', owner.sourceId).select('id'),
      intruder.client.from('conversations').delete().eq('id', owner.conversationId).select('id'),
      intruder.client.from('leads').delete().eq('id', owner.leadId).select('id'),
      intruder.client.from('assistants').delete().eq('id', owner.assistantId).select('id'),
    ]);

    for (const result of results) {
      expect(result.data ?? []).toEqual([]);
    }

    const [
      { data: assistant },
      { data: conversation },
      { data: message },
      { data: lead },
      { data: source },
    ] = await Promise.all([
      service.from('assistants').select('name').eq('id', owner.assistantId).single(),
      service.from('conversations').select('title').eq('id', owner.conversationId).single(),
      service.from('messages').select('feedback').eq('id', owner.messageId).single(),
      service.from('leads').select('status').eq('id', owner.leadId).single(),
      service.from('sources').select('id').eq('id', owner.sourceId).maybeSingle(),
    ]);

    expect(assistant).toEqual({ name: 'RLS owner' });
    expect(conversation).toEqual({ title: 'Private question' });
    expect(message).toEqual({ feedback: null });
    expect(lead).toEqual({ status: 'new' });
    expect(source).toEqual({ id: owner.sourceId });
  });

  it('keeps metering to the service role', async () => {
    const calls = await Promise.all([
      intruder.client.rpc('increment_usage', { owner: owner.id, usage: 'messages', delta: 100 }),
      intruder.client.rpc('reserve_message', { owner: owner.id, max_allowed: 1000 }),
      intruder.client.rpc('release_message', { owner: owner.id }),
    ]);

    for (const { error } of calls) {
      expect(error?.code).toBe(PERMISSION_DENIED);
    }

    const { data } = await service
      .from('usage_counters')
      .select('value')
      .eq('owner_id', owner.id)
      .eq('metric', 'messages')
      .single();

    expect(data).toEqual({ value: 3 });
  });

  it('lets an account record and read stops for its own answers only', async () => {
    const stop = (account: Account, assistantId: string) => ({
      message_id: crypto.randomUUID(),
      conversation_id: account.conversationId,
      assistant_id: assistantId,
      owner_id: account.id,
      content: 'API keys are',
    });
    const own = stop(owner, owner.assistantId);

    expect((await owner.client.from('message_stops').insert(own)).error).toBeNull();
    expect(
      (await owner.client.from('message_stops').select('content').eq('message_id', own.message_id))
        .data,
    ).toEqual([{ content: 'API keys are' }]);

    // Neither pointing a stop at someone else's assistant nor reading theirs works.
    const foreign = await intruder.client
      .from('message_stops')
      .insert(stop(intruder, owner.assistantId));

    expect(foreign.error?.code).toBe(PERMISSION_DENIED);
    expect(
      (
        await intruder.client
          .from('message_stops')
          .select('message_id')
          .eq('message_id', own.message_id)
      ).data,
    ).toEqual([]);

    // Stops are written once; nobody but the service role changes or removes them.
    const changed = await owner.client
      .from('message_stops')
      .update({ content: 'Something else' })
      .eq('message_id', own.message_id)
      .select('message_id');

    expect(changed.error?.code).toBe(PERMISSION_DENIED);
  });

  it('gives the anon key no table access at all', async () => {
    const anon = createClient<Database>(url, anonKey || 'not-configured', clientOptions);

    const [assistants, conversations, stops, owns] = await Promise.all([
      anon.from('assistants').select('id, public_key').limit(1),
      anon.from('conversations').select('id').limit(1),
      anon.from('message_stops').select('message_id').limit(1),
      anon.rpc('owns_assistant', { assistant: owner.assistantId }),
    ]);

    expect(assistants.error?.code).toBe(PERMISSION_DENIED);
    expect(conversations.error?.code).toBe(PERMISSION_DENIED);
    expect(stops.error?.code).toBe(PERMISSION_DENIED);
    expect(owns.error?.code).toBe(PERMISSION_DENIED);
  });
});
