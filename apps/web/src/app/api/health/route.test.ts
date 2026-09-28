// @vitest-environment node
import type { GoogleGenAI } from '@google/genai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGeminiProvider, forgetDailyLimits } from '@/lib/ai';
import { dailyLimit } from '@/lib/ai/quota.fixtures';

import { GET } from './route';

const NOW = new Date('2026-09-28T02:27:00Z');

const read = async () => (await GET().json()) as Record<string, unknown>;

/** A Gemini provider whose embeddings run into the daily limit, counting its requests. */
const cappedProvider = () => {
  let requests = 0;
  const client = {
    models: {
      embedContent: () => {
        requests += 1;

        return Promise.reject(dailyLimit());
      },
    },
  } as unknown as Pick<GoogleGenAI, 'models'>;

  return {
    provider: createGeminiProvider({ apiKey: 'test', clientImpl: client }),
    requests: () => requests,
  };
};

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    // CI's unit job runs without a database key; the route reads it through serverEnv().
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    forgetDailyLimits();
  });

  it('reports no limit while nothing has run into one', async () => {
    expect(await read()).toMatchObject({
      ok: true,
      ai: 'gemini',
      aiLimited: null,
      aiLimitedAt: null,
      aiResumesAt: null,
    });
  });

  it('reports the daily limit this instance ran into, and when it resets, without asking', async () => {
    const { provider, requests } = cappedProvider();

    await expect(provider.embed([{ text: 'Where are keys?' }], 'query')).rejects.toMatchObject({
      scope: 'day',
    });
    expect(requests()).toBe(1);

    vi.setSystemTime(new Date('2026-09-28T03:00:00Z'));

    expect(await read()).toMatchObject({
      ok: true,
      ai: 'gemini',
      aiLimited: 'daily',
      aiLimitedAt: '2026-09-28T02:27:00.000Z',
      aiResumesAt: '2026-09-28T07:00:00.000Z',
    });
    // Health read the limit from memory: no request of its own.
    expect(requests()).toBe(1);
  });

  it('stops reporting it once the limit has reset', async () => {
    const { provider } = cappedProvider();

    await provider.embed([{ text: 'Where are keys?' }], 'query').catch(() => undefined);
    vi.setSystemTime(new Date('2026-09-28T07:00:00Z'));

    expect(await read()).toMatchObject({ aiLimited: null, aiLimitedAt: null, aiResumesAt: null });
  });

  it('reports none on the stub, which has no limit', async () => {
    const { provider } = cappedProvider();

    await provider.embed([{ text: 'Where are keys?' }], 'query').catch(() => undefined);
    vi.stubEnv('AI_PROVIDER', 'stub');

    expect(await read()).toMatchObject({ ai: 'stub', aiLimited: null });
  });
});
