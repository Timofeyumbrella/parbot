import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  rows: [] as { id: string; feedback: number | null }[],
  error: null as { message: string } | null,
  update: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(async () => ({
    user: state.user,
    supabase: {
      from: () => ({
        update: (patch: unknown) => {
          state.update(patch);

          return {
            eq: () => ({
              eq: () => ({ select: async () => ({ data: state.rows, error: state.error }) }),
            }),
          };
        },
      }),
    },
  })),
}));

import { POST } from './route';

const MESSAGE = '33333333-3333-4333-8333-333333333333';

const post = (id: string, body: unknown) =>
  POST(
    new NextRequest(`http://localhost/api/messages/${id}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ messageId: id }) },
  );

describe('POST /api/messages/[messageId]/feedback', () => {
  beforeEach(() => {
    state.user = { id: 'user-1' };
    state.rows = [{ id: MESSAGE, feedback: 1 }];
    state.error = null;
  });

  it('validates the id and the value', async () => {
    expect((await post('nope', { value: 1 })).status).toBe(400);
    expect((await post(MESSAGE, { value: 2 })).status).toBe(400);
    expect((await post(MESSAGE, '{')).status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    state.user = null;

    expect((await post(MESSAGE, { value: 1 })).status).toBe(401);
  });

  it('reports 404 when row level security hides the message', async () => {
    state.rows = [];

    expect((await post(MESSAGE, { value: -1 })).status).toBe(404);
  });

  it('reports a database failure', async () => {
    state.error = { message: 'boom' };

    expect((await post(MESSAGE, { value: 1 })).status).toBe(500);
  });

  it('writes the feedback column only', async () => {
    const response = await post(MESSAGE, { value: null });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: MESSAGE, feedback: 1 });
    expect(state.update).toHaveBeenCalledWith({ feedback: null });
  });
});
