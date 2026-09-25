// @vitest-environment node
import { revalidatePath } from 'next/cache';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { MAX_TITLE_LENGTH } from '@/lib/chat/conversations';
import { getSession } from '@/lib/session';
import {
  createServiceClient,
  createTestAccount,
  deleteTestAccount,
  hasLocalDb,
  type TestAccount,
} from '@/test/local-db';

import { deleteConversation, renameConversation } from './conversations';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));

const signedOut = () =>
  vi.mocked(getSession).mockResolvedValue({ supabase: {}, user: null } as never);

/** A client whose every write fails, the way a dropped connection or a cancelled statement does. */
const failingClient = () => {
  const failed = {
    data: null,
    error: { code: '57014', message: 'canceling statement due to statement timeout' },
  };
  // `update().eq().select()` and `delete().eq()` both end in the same failed answer.
  const eq = () => Object.assign(Promise.resolve(failed), { select: async () => failed });

  return { from: () => ({ update: () => ({ eq }), delete: () => ({ eq }) }) };
};

describe('conversation actions without the database', () => {
  it('check the input before anything else', async () => {
    const id = crypto.randomUUID();

    await expect(renameConversation({ id: 'nope', title: 'Pricing' })).resolves.toEqual({
      ok: false,
      error: `A title needs 1 to ${MAX_TITLE_LENGTH} characters.`,
    });
    await expect(renameConversation({ id, title: '   ' })).resolves.toMatchObject({ ok: false });
    await expect(
      renameConversation({ id, title: 'x'.repeat(MAX_TITLE_LENGTH + 1) }),
    ).resolves.toMatchObject({ ok: false });
    await expect(deleteConversation({ id: 'nope' })).resolves.toEqual({
      ok: false,
      error: 'That conversation id is not valid.',
    });
    expect(getSession).not.toHaveBeenCalled();
  });

  it('ask a signed-out visitor to sign in', async () => {
    signedOut();

    const id = crypto.randomUUID();

    await expect(renameConversation({ id, title: 'Pricing' })).resolves.toEqual({
      ok: false,
      error: 'Sign in to rename a conversation.',
    });
    await expect(deleteConversation({ id })).resolves.toEqual({
      ok: false,
      error: 'Sign in to delete a conversation.',
    });
  });

  it('report a database failure in their own words', async () => {
    vi.mocked(getSession).mockResolvedValue({
      supabase: failingClient(),
      user: { id: crypto.randomUUID() },
    } as never);

    const id = crypto.randomUUID();

    await expect(renameConversation({ id, title: 'Pricing' })).resolves.toEqual({
      ok: false,
      error: 'The conversation could not be renamed. Try again.',
    });
    await expect(deleteConversation({ id })).resolves.toEqual({
      ok: false,
      error: 'The conversation could not be deleted. Try again.',
    });
  });
});

// Row level security decides which conversations an account may touch; these run against the local stack.
describe.skipIf(!hasLocalDb)('conversation actions against the local database', () => {
  const service = createServiceClient();
  let owner: TestAccount | null = null;
  let stranger: TestAccount | null = null;

  const signInAs = (account: TestAccount) =>
    vi
      .mocked(getSession)
      .mockResolvedValue({ supabase: account.client, user: { id: account.userId } } as never);

  const addConversation = async (title: string) => {
    const { data } = await service
      .from('conversations')
      .insert({ assistant_id: owner!.assistantId, owner_id: owner!.userId, channel: 'app', title })
      .select('id')
      .single();

    return data!.id;
  };

  const titleOf = async (id: string) => {
    const { data } = await service.from('conversations').select('title').eq('id', id).maybeSingle();

    return data?.title ?? null;
  };

  beforeAll(async () => {
    [owner, stranger] = await Promise.all([
      createTestAccount(service, 'chat-owner'),
      createTestAccount(service, 'chat-other'),
    ]);
  });

  afterAll(async () => {
    await Promise.all([deleteTestAccount(service, owner), deleteTestAccount(service, stranger)]);
  });

  it('renames an own conversation with the title trimmed, and revalidates nothing', async () => {
    const id = await addConversation('New chat');

    signInAs(owner!);

    await expect(renameConversation({ id, title: '  Pricing questions  ' })).resolves.toEqual({
      ok: true,
    });
    expect(await titleOf(id)).toBe('Pricing questions');
    // The chat list already shows the new title; a revalidation would refetch the chat route.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reads another account's conversation as one that no longer exists", async () => {
    const id = await addConversation('Private');

    signInAs(stranger!);

    await expect(renameConversation({ id, title: 'Mine now' })).resolves.toEqual({
      ok: false,
      error: 'That conversation no longer exists.',
    });
    await deleteConversation({ id });
    expect(await titleOf(id)).toBe('Private');
  });

  it('deletes an own conversation, and revalidates nothing', async () => {
    const id = await addConversation('Old thread');

    signInAs(owner!);

    await expect(deleteConversation({ id })).resolves.toEqual({ ok: true });
    expect(await titleOf(id)).toBeNull();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
