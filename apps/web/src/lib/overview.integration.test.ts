// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/db';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };

type Client = SupabaseClient<Database>;

/**
 * The Overview's SQL functions run as the caller, so row level security decides what each one
 * sees. The owner gets their numbers; another signed-in account asking about the same assistant
 * gets nothing; an anonymous caller may not run them at all.
 */
describe.skipIf(!serviceKey || !anonKey)('Overview functions against the local database', () => {
  const service = createClient<Database>(url, serviceKey || 'not-configured', options);
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const userIds: string[] = [];
  let owner: Client;
  let intruder: Client;
  let assistantId: string;
  let documentId: string;
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const previousSince = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const signedIn = async (label: string) => {
    const email = `overview-${label}-${stamp}@parbot.test`;
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

    const client = createClient<Database>(url, anonKey || 'not-configured', options);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });

    if (signInError) {
      throw new Error(signInError.message);
    }

    return { id: data.user.id, client };
  };

  beforeAll(async () => {
    const [ownerAccount, intruderAccount] = await Promise.all([
      signedIn('owner'),
      signedIn('intruder'),
    ]);

    owner = ownerAccount.client;
    intruder = intruderAccount.client;

    const ownerId = ownerAccount.id;
    const { data: assistant } = await service
      .from('assistants')
      .insert({ owner_id: ownerId, name: 'Overview functions', slug: `overview-${stamp}` })
      .select('id')
      .single();

    assistantId = assistant!.id;

    const owned = { assistant_id: assistantId, owner_id: ownerId };
    const { data: source } = await service
      .from('sources')
      .insert({ ...owned, kind: 'url', title: 'docs', uri: 'https://docs.acme.test' })
      .select('id')
      .single();
    const { data: documents } = await service
      .from('documents')
      .insert([
        {
          ...owned,
          source_id: source!.id,
          title: 'Webhooks',
          url: 'https://docs.acme.test/webhooks',
          content: 'Webhooks.',
          checksum: `${stamp}-1`,
        },
        {
          ...owned,
          source_id: source!.id,
          title: 'Legacy',
          url: 'https://docs.acme.test/legacy',
          content: 'Legacy.',
          checksum: `${stamp}-2`,
        },
      ])
      .select('id, title');

    documentId = documents!.find((row) => row.title === 'Webhooks')!.id;

    const conversation = async (question: string, answer: Record<string, unknown>) => {
      const { data } = await service
        .from('conversations')
        .insert({
          ...owned,
          channel: 'widget',
          visitor_id: `v-${stamp}`,
          page_url: 'https://docs.acme.test/webhooks?tab=node#verify',
        })
        .select('id')
        .single();
      const at = Date.now() - 60_000;

      // One insert per row: a bulk insert sends every column of every row, and the question's
      // missing citations would go in as null rather than the column's default.
      for (const row of [
        { role: 'user' as const, content: question, created_at: new Date(at).toISOString() },
        { role: 'assistant' as const, created_at: new Date(at + 1000).toISOString(), ...answer },
      ]) {
        const { error } = await service
          .from('messages')
          .insert({ ...owned, conversation_id: data!.id, content: '', ...row });

        if (error) {
          throw new Error(error.message);
        }
      }
    };

    await conversation('How are webhooks signed?', {
      content: 'With a signature header [1].',
      answered: true,
      feedback: -1,
      latency_ms: 1200,
      citations: [
        {
          index: 1,
          documentId,
          title: 'Webhooks',
          url: 'https://docs.acme.test/webhooks',
          snippet: '',
        },
        // Not an id at all: skipped, never a failed query.
        { index: 2, documentId: 'not-a-uuid', title: 'Broken', url: null, snippet: '' },
      ],
    });
    await conversation('Is there a Slack integration?', {
      content: 'I could not find that.',
      answered: false,
      latency_ms: 800,
    });
    await service.from('leads').insert({ ...owned, email: `reader-${stamp}@acme.test` });
  });

  afterAll(async () => {
    await Promise.all(userIds.map((id) => service.auth.admin.deleteUser(id)));
  });

  const everything = (client: Client) =>
    Promise.all([
      client.rpc('overview_totals', {
        assistant: assistantId,
        since,
        previous_since: previousSince,
      }),
      client.rpc('knowledge_gaps', { assistant: assistantId, since }),
      client.rpc('disliked_answers', { assistant: assistantId, since }),
      client.rpc('cited_documents', { assistant: assistantId, since }),
      client.rpc('uncited_documents', { assistant: assistantId, since }),
      client.rpc('page_activity', { assistant: assistantId, since }),
    ]);

  it('gives the owner their numbers', async () => {
    const [totals, gaps, disliked, cited, uncited, pages] = await everything(owner);

    for (const result of [totals, gaps, disliked, cited, uncited, pages]) {
      expect(result.error).toBeNull();
    }

    const current = totals.data!.find((row) => row.period === 'current')!;

    expect(current).toMatchObject({
      questions: 2,
      answered: 1,
      unanswered: 1,
      negative: 1,
      median_latency_ms: 1000,
      leads: 1,
      new_leads: 1,
    });
    expect(totals.data!.find((row) => row.period === 'previous')).toMatchObject({ questions: 0 });
    expect(gaps.data!.map((row) => row.question)).toEqual(['Is there a Slack integration?']);
    expect(disliked.data).toMatchObject([
      { question: 'How are webhooks signed?', answer: 'With a signature header [1].', total: 1 },
    ]);
    // A citation whose page is gone still counts, under the title it was cited with.
    expect(cited.data!.map((row) => [row.title, row.answers, row.document_id])).toEqual([
      ['Broken', 1, null],
      ['Webhooks', 1, documentId],
    ]);
    expect(uncited.data!.map((row) => row.title)).toEqual(['Legacy']);
    expect(pages.data).toMatchObject([
      { host: 'docs.acme.test', path: '/webhooks', questions: 2, answered: 1, unanswered: 1 },
    ]);
  });

  it('gives another account nothing about the same assistant', async () => {
    const [totals, gaps, disliked, cited, uncited, pages] = await everything(intruder);

    expect(totals.data!.find((row) => row.period === 'current')).toMatchObject({
      questions: 0,
      answered: 0,
      leads: 0,
    });

    for (const result of [gaps, disliked, cited, uncited, pages]) {
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
  });

  it('refuses an anonymous caller', async () => {
    const anon = createClient<Database>(url, anonKey || 'not-configured', options);
    const results = await everything(anon);

    for (const result of results) {
      expect(result.error?.code).toBe('42501');
    }
  });
});
