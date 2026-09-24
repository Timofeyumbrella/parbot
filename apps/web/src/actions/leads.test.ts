import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  update: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: async () => ({
    user: session.user,
    supabase: {
      from: () => ({
        update: (values: unknown) => ({
          eq: (column: string, value: string) => ({
            select: () => ({
              maybeSingle: () => session.update(values, column, value),
            }),
          }),
        }),
      }),
    },
  }),
}));

import { updateLeadStatus } from './leads';

const LEAD = '6f0a2c1e-6d5f-4d1e-9c21-3a1b0c2d3e4f';

describe('updateLeadStatus', () => {
  beforeEach(() => {
    session.user = { id: 'user-1' };
    session.update.mockResolvedValue({ data: { id: LEAD, status: 'contacted' }, error: null });
  });

  it('rejects bad input before touching the database', async () => {
    expect(await updateLeadStatus({ leadId: 'not-a-uuid', status: 'contacted' })).toMatchObject({ ok: false });
    expect(await updateLeadStatus({ leadId: LEAD, status: 'archived' })).toMatchObject({ ok: false });
    expect(await updateLeadStatus(null)).toMatchObject({ ok: false });
    expect(session.update).not.toHaveBeenCalled();
  });

  it('refuses without a session', async () => {
    session.user = null;

    const result = await updateLeadStatus({ leadId: LEAD, status: 'contacted' });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Sign in') });
    expect(session.update).not.toHaveBeenCalled();
  });

  it('updates the lead by id as the visitor and returns the saved status', async () => {
    const result = await updateLeadStatus({ leadId: LEAD, status: 'contacted' });

    expect(result).toEqual({ ok: true, status: 'contacted' });
    expect(session.update).toHaveBeenCalledWith({ status: 'contacted' }, 'id', LEAD);
  });

  it('reports a lead that row level security hid or that is gone', async () => {
    session.update.mockResolvedValue({ data: null, error: null });

    expect(await updateLeadStatus({ leadId: LEAD, status: 'closed' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('no longer exists'),
    });
  });

  it('surfaces database errors in plain words', async () => {
    session.update.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    expect(await updateLeadStatus({ leadId: LEAD, status: 'closed' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('connection reset'),
    });
  });
});
