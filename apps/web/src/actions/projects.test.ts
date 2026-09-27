// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/db';
import { getSession } from '@/lib/session';
import { createServiceClient, hasLocalDb } from '@/test/local-db';

import { createProject, deleteProject, moveConversation, updateProject } from './projects';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));

const signedOut = () =>
  vi.mocked(getSession).mockResolvedValue({ supabase: {}, user: null } as never);

describe('project actions without the database', () => {
  it('check the input before anything else', async () => {
    const id = crypto.randomUUID();

    await expect(
      createProject({ id, assistantId: crypto.randomUUID(), name: '   ' }),
    ).resolves.toEqual({ ok: false, error: 'A project name needs 1 to 60 characters.' });
    await expect(
      createProject({ id: 'nope', assistantId: crypto.randomUUID(), name: 'Billing' }),
    ).resolves.toMatchObject({ ok: false });
    await expect(updateProject({ id, instructions: 'x'.repeat(4001) })).resolves.toEqual({
      ok: false,
      error: 'Keep the instructions under 4,000 characters.',
    });
    await expect(
      updateProject({ id, sourceIds: Array.from({ length: 21 }, () => crypto.randomUUID()) }),
    ).resolves.toEqual({ ok: false, error: 'A project holds up to 20 files.' });
    await expect(updateProject({ id, sourceIds: ['../etc/passwd'] })).resolves.toMatchObject({
      ok: false,
    });
    await expect(updateProject({ id, name: 'x'.repeat(61) })).resolves.toEqual({
      ok: false,
      error: 'A project name needs 1 to 60 characters.',
    });
    await expect(deleteProject({ id: 'nope' })).resolves.toEqual({
      ok: false,
      error: 'That project id is not valid.',
    });
    await expect(moveConversation({ conversationId: id, projectId: 'nope' })).resolves.toEqual({
      ok: false,
      error: 'That conversation or project id is not valid.',
    });
    expect(getSession).not.toHaveBeenCalled();
  });

  it('ask a signed-out visitor to sign in', async () => {
    signedOut();

    const id = crypto.randomUUID();

    await expect(
      createProject({ id, assistantId: crypto.randomUUID(), name: 'Billing' }),
    ).resolves.toEqual({ ok: false, error: 'Sign in to create a project.' });
    await expect(updateProject({ id, name: 'Billing' })).resolves.toEqual({
      ok: false,
      error: 'Sign in to change a project.',
    });
    await expect(deleteProject({ id })).resolves.toEqual({
      ok: false,
      error: 'Sign in to delete a project.',
    });
    await expect(moveConversation({ conversationId: id, projectId: null })).resolves.toEqual({
      ok: false,
      error: 'Sign in to move a conversation.',
    });
  });
});

type Account = { userId: string; assistantId: string; client: SupabaseClient<Database> };

// Row level security decides what an account may touch; these run against the local stack.
describe.skipIf(!hasLocalDb)('project actions against the local database', () => {
  const service = createServiceClient();
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const accounts: Account[] = [];
  let owner: Account;
  let stranger: Account;

  const createAccount = async (label: string): Promise<Account> => {
    const email = `project-actions-${label}-${stamp}@parbot.test`;
    const password = `pw-${crypto.randomUUID()}`;
    const { data } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    const userId = data.user!.id;
    const { data: assistant } = await service
      .from('assistants')
      .insert({ owner_id: userId, name: label, slug: `project-actions-${label}-${stamp}` })
      .select('id')
      .single();
    const client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'not-configured',
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    await client.auth.signInWithPassword({ email, password });

    const account = { userId, assistantId: assistant!.id, client };

    accounts.push(account);

    return account;
  };

  const signInAs = (account: Account) =>
    vi
      .mocked(getSession)
      .mockResolvedValue({ supabase: account.client, user: { id: account.userId } } as never);

  const addSource = async (account: Account, title: string) => {
    const { data } = await service
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

    return data!.id;
  };

  const addConversation = async (account: Account, projectId: string | null = null) => {
    const { data } = await service
      .from('conversations')
      .insert({
        assistant_id: account.assistantId,
        owner_id: account.userId,
        channel: 'app',
        title: 'A chat',
        project_id: projectId,
      })
      .select('id')
      .single();

    return data!.id;
  };

  const projectOf = async (conversationId: string) => {
    const { data } = await service
      .from('conversations')
      .select('project_id')
      .eq('id', conversationId)
      .maybeSingle();

    return data?.project_id ?? null;
  };

  beforeAll(async () => {
    owner = await createAccount('owner');
    stranger = await createAccount('stranger');
  });

  afterAll(async () => {
    for (const account of accounts) {
      await service.auth.admin.deleteUser(account.userId);
    }
  });

  it('creates a project, names each one once, and revalidates nothing', async () => {
    signInAs(owner);

    const id = crypto.randomUUID();
    const created = await createProject({ id, assistantId: owner.assistantId, name: ' Billing ' });

    expect(created).toEqual({
      ok: true,
      project: expect.objectContaining({ id, name: 'Billing', instructions: '', sources: [] }),
    });
    await expect(
      createProject({ id: crypto.randomUUID(), assistantId: owner.assistantId, name: 'BILLING' }),
    ).resolves.toEqual({
      ok: false,
      error: 'There is already a project called “BILLING”. Pick another name.',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a project on another account's assistant", async () => {
    signInAs(stranger);

    await expect(
      createProject({ id: crypto.randomUUID(), assistantId: owner.assistantId, name: 'Mine' }),
    ).resolves.toEqual({ ok: false, error: 'The project could not be created. Try again.' });
  });

  it('saves instructions and files in order, and leaves out files that are not the assistant’s', async () => {
    signInAs(owner);

    const id = crypto.randomUUID();

    await createProject({ id, assistantId: owner.assistantId, name: 'Files' });

    const [pricing, refunds, foreign] = await Promise.all([
      addSource(owner, 'Pricing'),
      addSource(owner, 'Refunds'),
      addSource(stranger, 'Secret'),
    ]);
    const saved = await updateProject({
      id,
      instructions: '  Answer for the billing team.  ',
      sourceIds: [refunds, foreign, pricing, crypto.randomUUID()],
    });

    expect(saved).toEqual({
      ok: true,
      project: expect.objectContaining({
        instructions: 'Answer for the billing team.',
        sources: [
          { id: refunds, title: 'Refunds', kind: 'text' },
          { id: pricing, title: 'Pricing', kind: 'text' },
        ],
      }),
    });

    // Replaced, in the new order, with one taken off.
    const replaced = await updateProject({ id, sourceIds: [pricing] });

    expect(replaced.ok && replaced.project.sources.map((source) => source.id)).toEqual([pricing]);

    const renamed = await updateProject({ id, name: 'Pricing and refunds' });

    expect(renamed.ok && renamed.project.name).toBe('Pricing and refunds');
    expect(renamed.ok && renamed.project.instructions).toBe('Answer for the billing team.');
  });

  it("reads another account's project as one that no longer exists", async () => {
    signInAs(owner);

    const id = crypto.randomUUID();

    await createProject({ id, assistantId: owner.assistantId, name: 'Private' });
    signInAs(stranger);

    await expect(updateProject({ id, name: 'Mine now' })).resolves.toEqual({
      ok: false,
      error: 'That project no longer exists.',
    });
    await deleteProject({ id });

    const { data } = await service.from('chat_projects').select('name').eq('id', id).single();

    expect(data?.name).toBe('Private');
  });

  it('moves a conversation in and out, and never into another account’s project', async () => {
    signInAs(owner);

    const projectId = crypto.randomUUID();

    await createProject({ id: projectId, assistantId: owner.assistantId, name: 'Moves' });

    const conversationId = await addConversation(owner);

    await expect(moveConversation({ conversationId, projectId })).resolves.toEqual({ ok: true });
    expect(await projectOf(conversationId)).toBe(projectId);
    await expect(moveConversation({ conversationId, projectId: null })).resolves.toEqual({
      ok: true,
    });
    expect(await projectOf(conversationId)).toBeNull();

    // The stranger's own conversation cannot join the owner's project.
    signInAs(stranger);

    const theirs = await addConversation(stranger);

    await expect(moveConversation({ conversationId: theirs, projectId })).resolves.toEqual({
      ok: false,
      error: 'That project no longer exists. Pick another one.',
    });
    // Nor can they move the owner's conversation.
    await expect(moveConversation({ conversationId, projectId: null })).resolves.toEqual({
      ok: false,
      error: 'That conversation no longer exists.',
    });
    expect(await projectOf(theirs)).toBeNull();
  });

  it('deletes a project and keeps its conversations, outside any project', async () => {
    signInAs(owner);

    const projectId = crypto.randomUUID();

    await createProject({ id: projectId, assistantId: owner.assistantId, name: 'Doomed' });

    const conversationId = await addConversation(owner, projectId);

    await expect(deleteProject({ id: projectId })).resolves.toEqual({ ok: true });

    const { data } = await service
      .from('conversations')
      .select('id, project_id')
      .eq('id', conversationId)
      .single();

    expect(data).toEqual({ id: conversationId, project_id: null });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
