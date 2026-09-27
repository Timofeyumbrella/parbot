import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAssistant,
  deleteAssistant,
  regeneratePublicKey,
  updateAssistant,
} from './assistants';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const ASSISTANT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const EXISTING_ID = '9b2c7d1e-4f3a-4b5c-8d6e-7f8091a2b3c4';

type Row = Record<string, unknown>;

/**
 * A tiny stand in for the Supabase query builder: every call returns the builder and the
 * terminal `single`/`maybeSingle`/await resolve with what the test queued.
 */
const { queue, calls } = vi.hoisted(() => ({
  queue: [] as { data: unknown; error: { code?: string; message: string } | null }[],
  calls: [] as { method: string; args: unknown[] }[],
}));

const builder = () => {
  const next = () => queue.shift() ?? { data: null, error: null };
  const api: Row = {};
  const chain =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });

      return api;
    };

  for (const method of [
    'from',
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'order',
    'like',
    'limit',
  ]) {
    api[method] = chain(method);
  }

  api.single = () => Promise.resolve(next());
  api.maybeSingle = () => Promise.resolve(next());
  api.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(next()).then(resolve, reject);

  return api;
};

const { redirect, revalidatePath, requireUser, removeStoredFiles, service } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
  revalidatePath: vi.fn(),
  requireUser: vi.fn(),
  removeStoredFiles: vi.fn(),
  service: { role: 'service' },
}));

vi.mock('@/lib/session', () => ({ requireUser }));
vi.mock('@/lib/source-files', () => ({ removeStoredFiles }));
vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: () => service }));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/cache', () => ({ revalidatePath }));

const form = (entries: Record<string, string>) => {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }

  return data;
};

const idle = { status: 'idle' as const };

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  requireUser.mockResolvedValue({ supabase: builder(), user: { id: USER_ID } });
});

const inserts = () => calls.filter((call) => call.method === 'insert');

describe('createAssistant', () => {
  it('sends an account that already has its assistant there, and never inserts a second', async () => {
    queue.push({ data: { id: EXISTING_ID }, error: null });

    await expect(
      createAssistant(idle, form({ name: 'Second', slug: '', description: '' })),
    ).rejects.toThrow(`REDIRECT /a/${EXISTING_ID}`);

    expect(inserts()).toHaveLength(0);
    // The sidebar this tab drew before the assistant existed is refreshed on the way.
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('returns field errors before checking anything else', async () => {
    const state = await createAssistant(
      idle,
      form({ name: '', slug: 'Bad Slug', description: '' }),
    );

    expect(state.status).toBe('error');
    expect(state.fieldErrors).toEqual({
      name: 'Give the assistant a name.',
      slug: '2 to 48 lowercase letters, numbers and single hyphens.',
    });
    expect(requireUser).not.toHaveBeenCalled();
  });

  it('creates the first assistant with a slug from its name and opens its knowledge', async () => {
    queue.push({ data: null, error: null });
    queue.push({ data: { id: ASSISTANT_ID }, error: null });

    await expect(
      createAssistant(idle, form({ name: 'Acme Docs', slug: '', description: 'Notes' })),
    ).rejects.toThrow(`REDIRECT /a/${ASSISTANT_ID}/knowledge`);

    expect(inserts().map((call) => call.args[0])).toEqual([
      { owner_id: USER_ID, name: 'Acme Docs', slug: 'acme-docs', description: 'Notes' },
    ]);
    // The sidebar in the shared layout starts naming the assistant.
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('keeps a slug the visitor typed', async () => {
    queue.push({ data: null, error: null });
    queue.push({ data: { id: ASSISTANT_ID }, error: null });

    await expect(
      createAssistant(idle, form({ name: 'Acme Docs', slug: 'help', description: '' })),
    ).rejects.toThrow('REDIRECT');

    expect((inserts()[0]?.args[0] as Row).slug).toBe('help');
  });

  it('sends a second tab that lost the race to the assistant the first one created', async () => {
    queue.push({ data: null, error: null });
    queue.push({ data: null, error: { code: '23505', message: 'duplicate key' } });
    queue.push({ data: { id: EXISTING_ID }, error: null });

    await expect(
      createAssistant(idle, form({ name: 'Acme', slug: 'acme', description: '' })),
    ).rejects.toThrow(`REDIRECT /a/${EXISTING_ID}`);

    expect(inserts()).toHaveLength(1);
  });

  it('explains a lost race when the winner cannot be read', async () => {
    queue.push({ data: null, error: null });
    queue.push({ data: null, error: { code: '23505', message: 'duplicate key' } });
    queue.push({ data: null, error: null });

    const state = await createAssistant(idle, form({ name: 'Acme', slug: '', description: '' }));

    expect(state).toMatchObject({
      status: 'error',
      error: 'This account already has an assistant. Reload the page to open it.',
      values: { name: 'Acme' },
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('explains a database failure instead of throwing', async () => {
    queue.push({ data: null, error: null });
    queue.push({ data: null, error: { code: '42501', message: 'permission denied' } });

    const state = await createAssistant(idle, form({ name: 'Acme', slug: '', description: '' }));

    expect(state).toMatchObject({
      status: 'error',
      error: 'The assistant could not be created. Try again.',
    });
  });
});

describe('updateAssistant', () => {
  const fields = {
    assistantId: ASSISTANT_ID,
    name: 'Acme',
    slug: 'acme',
    description: '',
    instructions: '',
  };

  it('writes the row and reports success, leaving the Widget page columns alone', async () => {
    queue.push({ data: { id: ASSISTANT_ID }, error: null });

    // A stale form that still posts the old fields must not overwrite what the Widget page saved.
    const state = await updateAssistant(
      idle,
      form({ ...fields, welcomeMessage: 'Stale.', suggestedQuestions: 'Old question' }),
    );

    expect(state).toMatchObject({ status: 'success', message: 'Settings saved.' });

    const update = calls.find((call) => call.method === 'update');

    expect(update?.args[0]).toEqual({
      name: 'Acme',
      slug: 'acme',
      description: null,
      instructions: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/a/${ASSISTANT_ID}/settings`);
  });

  it('turns a unique violation into a slug field error', async () => {
    queue.push({ data: null, error: { code: '23505', message: 'duplicate key' } });

    const state = await updateAssistant(idle, form(fields));

    expect(state.fieldErrors).toEqual({
      slug: 'This slug is already in use. Choose another.',
    });
  });

  it('reports a row it cannot see as gone', async () => {
    queue.push({ data: null, error: null });

    const state = await updateAssistant(idle, form(fields));

    expect(state).toMatchObject({ status: 'error', error: 'That assistant no longer exists.' });
  });
});

describe('regeneratePublicKey', () => {
  it('writes a fresh pb_ key and returns it', async () => {
    queue.push({ data: { public_key: 'pb_' + 'a'.repeat(32) }, error: null });

    const result = await regeneratePublicKey(ASSISTANT_ID);

    expect(result).toEqual({ ok: true, publicKey: 'pb_' + 'a'.repeat(32) });

    const update = calls.find((call) => call.method === 'update');

    expect((update?.args[0] as Row).public_key).toMatch(/^pb_[0-9a-f]{32}$/);
  });

  it('rejects a malformed id without a query', async () => {
    const result = await regeneratePublicKey('nope');

    expect(result).toEqual({ ok: false, error: 'That assistant does not exist.' });
    expect(calls).toHaveLength(0);
  });
});

describe('deleteAssistant', () => {
  it('requires the typed name to match', async () => {
    queue.push({ data: { id: ASSISTANT_ID, name: 'Acme' }, error: null });

    const state = await deleteAssistant(
      idle,
      form({ assistantId: ASSISTANT_ID, confirmName: 'acme' }),
    );

    expect(state.fieldErrors).toEqual({ confirmName: 'Type Acme exactly as shown.' });
    expect(calls.some((call) => call.method === 'delete')).toBe(false);
  });

  it('removes the stored files through the service role, then the row, and returns to onboarding', async () => {
    queue.push({ data: { id: ASSISTANT_ID, name: 'Acme' }, error: null });
    queue.push({ data: null, error: null });
    let deletedBeforeFiles = false;
    removeStoredFiles.mockImplementation(async () => {
      deletedBeforeFiles = calls.some((call) => call.method === 'delete');

      return [`${USER_ID}/${ASSISTANT_ID}/one.md`];
    });

    await expect(
      deleteAssistant(idle, form({ assistantId: ASSISTANT_ID, confirmName: ' Acme ' })),
    ).rejects.toThrow('REDIRECT /onboarding');

    expect(removeStoredFiles).toHaveBeenCalledWith(service, `${USER_ID}/${ASSISTANT_ID}`);
    expect(deletedBeforeFiles).toBe(false);
    expect(calls.some((call) => call.method === 'delete')).toBe(true);
    // It was the account's only assistant, so every screen's sidebar changes.
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('keeps the row when the files could not be removed, so nothing is orphaned', async () => {
    queue.push({ data: { id: ASSISTANT_ID, name: 'Acme' }, error: null });
    removeStoredFiles.mockRejectedValue(new Error('storage is down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const state = await deleteAssistant(
      idle,
      form({ assistantId: ASSISTANT_ID, confirmName: 'Acme' }),
    );

    expect(state).toMatchObject({
      status: 'error',
      error: 'The assistant’s files could not be removed. Try again in a moment.',
    });
    expect(calls.some((call) => call.method === 'delete')).toBe(false);
    expect(redirect).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      '[assistants] stored files were not removed',
      expect.anything(),
    );
  });
});
