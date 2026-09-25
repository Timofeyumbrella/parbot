import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PLANS } from '@/lib/plans';

import { saveWidgetSettings, type WidgetFormState } from './widget';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const ASSISTANT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

type Row = Record<string, unknown>;

/**
 * A tiny stand in for the Supabase query builder: every call returns the builder, the terminal
 * `maybeSingle` resolves with what the test queued, and every call is recorded.
 */
const { queue, calls } = vi.hoisted(() => ({
  queue: [] as { data: unknown; error: { message: string } | null }[],
  calls: [] as { method: string; args: unknown[] }[],
}));

const builder = () => {
  const api: Row = {};
  const chain =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });

      return api;
    };

  for (const method of ['from', 'select', 'update', 'eq']) {
    api[method] = chain(method);
  }

  api.maybeSingle = () => Promise.resolve(queue.shift() ?? { data: null, error: null });

  return api;
};

const { getAccountPlan, revalidatePath, requireUser } = vi.hoisted(() => ({
  getAccountPlan: vi.fn(),
  revalidatePath: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock('@/lib/account', () => ({ getAccountPlan }));
vi.mock('@/lib/session', () => ({ requireUser }));
vi.mock('next/cache', () => ({ revalidatePath }));

const form = (entries: Record<string, string>) => {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }

  return data;
};

const idle: WidgetFormState = { status: 'idle' };

const free = {
  assistantId: ASSISTANT_ID,
  mode: 'bubble',
  welcomeMessage: 'Ask me about the docs.',
  suggestedQuestions: 'How do I start?\nWhat does it cost?',
  allowedOrigins: 'docs.example.com',
};

const paid = {
  ...free,
  mode: 'palette',
  scheme: 'dark',
  accent: '#2563EB',
  position: 'left',
  radius: 'lg',
  hideBranding: 'on',
  leadCapture: 'on',
};

const updatePayload = () =>
  calls.find((call) => call.method === 'update')?.args[0] as Row | undefined;

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  requireUser.mockResolvedValue({ supabase: builder(), user: { id: USER_ID } });
  getAccountPlan.mockResolvedValue({ plan: PLANS.hobby, status: 'active' });
});

describe('saveWidgetSettings', () => {
  it('saves free settings on Hobby, scoped to the owner, and revalidates the screen', async () => {
    queue.push({ data: { id: ASSISTANT_ID }, error: null });

    const state = await saveWidgetSettings(idle, form(free));

    expect(state).toMatchObject({
      status: 'saved',
      settings: {
        mode: 'bubble',
        theme: { scheme: 'auto', accent: '#f59e0b', position: 'right', radius: 'md' },
        welcomeMessage: 'Ask me about the docs.',
        suggestedQuestions: ['How do I start?', 'What does it cost?'],
        allowedOrigins: ['docs.example.com'],
        hideBranding: false,
        leadCapture: false,
      },
    });
    expect(updatePayload()).toEqual({
      mode: 'bubble',
      theme: { scheme: 'auto', accent: '#f59e0b', position: 'right', radius: 'md' },
      welcome_message: 'Ask me about the docs.',
      suggested_questions: ['How do I start?', 'What does it cost?'],
      allowed_origins: ['docs.example.com'],
      hide_branding: false,
      lead_capture: false,
    });
    expect(calls.filter((call) => call.method === 'eq').map((call) => call.args)).toEqual([
      ['id', ASSISTANT_ID],
      ['owner_id', USER_ID],
    ]);
    expect(revalidatePath).toHaveBeenCalledWith(`/a/${ASSISTANT_ID}/widget`);
  });

  it('refuses gated settings on Hobby before touching the database, keeping what was typed', async () => {
    const state = await saveWidgetSettings(idle, form(paid));

    expect(state).toMatchObject({
      status: 'error',
      error: 'The palette mode is available on Starter and up.',
      values: { mode: 'palette', accent: '#2563EB', hideBranding: 'on' },
    });
    expect(updatePayload()).toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('checks the gates one at a time, so a re-enabled switch is caught as well', async () => {
    const brandingOnly = { ...free, hideBranding: 'on' };
    const leadOnly = { ...free, leadCapture: 'on' };
    const themeOnly = { ...free, accent: '#2563eb' };

    expect((await saveWidgetSettings(idle, form(brandingOnly))) as WidgetFormState).toMatchObject({
      status: 'error',
      error: expect.stringContaining('branding'),
    });
    expect((await saveWidgetSettings(idle, form(leadOnly))) as WidgetFormState).toMatchObject({
      status: 'error',
      error: expect.stringContaining('Lead capture'),
    });
    expect((await saveWidgetSettings(idle, form(themeOnly))) as WidgetFormState).toMatchObject({
      status: 'error',
      error: expect.stringContaining('theme'),
    });
  });

  it('saves every paid setting on Starter with a lower-cased accent', async () => {
    getAccountPlan.mockResolvedValue({ plan: PLANS.starter, status: 'active' });
    queue.push({ data: { id: ASSISTANT_ID }, error: null });

    const state = await saveWidgetSettings(idle, form(paid));

    expect(state.status).toBe('saved');
    expect(updatePayload()).toMatchObject({
      mode: 'palette',
      theme: { scheme: 'dark', accent: '#2563eb', position: 'left', radius: 'lg' },
      hide_branding: true,
      lead_capture: true,
    });
  });

  it('explains a validation failure and hands the typed values back', async () => {
    const state = await saveWidgetSettings(
      idle,
      form({ ...free, suggestedQuestions: '1\n2\n3\n4\n5' }),
    );

    expect(state).toMatchObject({
      status: 'error',
      error: 'List at most 4 suggested questions.',
      values: { suggestedQuestions: '1\n2\n3\n4\n5' },
    });
    expect(updatePayload()).toBeUndefined();
  });

  it("reads as not found when the id is malformed or the row is not the visitor's", async () => {
    expect(await saveWidgetSettings(idle, form({ ...free, assistantId: 'nope' }))).toMatchObject({
      status: 'error',
      error: 'That assistant could not be found.',
    });

    queue.push({ data: null, error: null });
    expect(await saveWidgetSettings(idle, form(free))).toMatchObject({
      status: 'error',
      error: 'That assistant could not be found.',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('says so when the database refuses the update', async () => {
    queue.push({ data: null, error: { message: 'boom' } });

    expect(await saveWidgetSettings(idle, form(free))).toMatchObject({
      status: 'error',
      error: 'The settings could not be saved. Try again.',
    });
  });
});
