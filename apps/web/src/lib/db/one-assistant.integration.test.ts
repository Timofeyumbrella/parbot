// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createServiceClient,
  createTestAccount,
  deleteTestAccount,
  hasLocalDb,
  type TestAccount,
} from '@/test/local-db';

/** Postgres: a unique index rejected the row. */
const UNIQUE_VIOLATION = '23505';

/**
 * Migration 20260928040000: an account owns one assistant, and the database refuses a second
 * however it is written, through the account's own session or the service role.
 */
describe.skipIf(!hasLocalDb)('one assistant per account, in the local database', () => {
  const service = createServiceClient();
  let owner: TestAccount | null = null;
  let other: TestAccount | null = null;

  beforeAll(async () => {
    // Each comes with its assistant.
    [owner, other] = await Promise.all([
      createTestAccount(service, 'one-owner'),
      createTestAccount(service, 'one-other'),
    ]);
  });

  afterAll(async () => {
    await Promise.all([deleteTestAccount(service, owner), deleteTestAccount(service, other)]);
  });

  it('rejects a second assistant written through the account’s own session', async () => {
    const { error } = await owner!.client
      .from('assistants')
      .insert({ owner_id: owner!.userId, name: 'Second', slug: 'second' });

    expect(error?.code).toBe(UNIQUE_VIOLATION);
    expect(error?.message).toContain('assistants_one_per_owner');
  });

  it('rejects it through the service role too, which row level security does not cover', async () => {
    const { error } = await service
      .from('assistants')
      .insert({ owner_id: owner!.userId, name: 'Second', slug: 'second' });

    expect(error?.code).toBe(UNIQUE_VIOLATION);

    const { count } = await service
      .from('assistants')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', owner!.userId);

    expect(count).toBe(1);
  });

  it('still lets each account have its own, and a new one once the old is deleted', async () => {
    expect(other!.assistantId).not.toBe(owner!.assistantId);

    const { error: deleteError } = await owner!.client
      .from('assistants')
      .delete()
      .eq('id', owner!.assistantId);

    expect(deleteError).toBeNull();

    const { data, error } = await owner!.client
      .from('assistants')
      .insert({ owner_id: owner!.userId, name: 'Fresh start', slug: 'fresh-start' })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data?.id).not.toBe(owner!.assistantId);
  });
});
