// @vitest-environment node
import type { GoogleGenAI } from '@google/genai';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import {
  createGeminiProvider,
  type GeminiOptions,
  MAX_QUOTA_WAIT_MS,
  QUERY_QUOTA_WAIT_MS,
  QUOTA_WAIT_MARGIN_MS,
} from './gemini';
import { activeDailyLimit, forgetDailyLimits, nextDailyReset } from './quota';
import { dailyLimit, minuteLimit } from './quota.fixtures';
import {
  EMBEDDING_DIMENSIONS,
  type EmbedInput,
  ModelBusyError,
  ProviderError,
  ProviderLimitError,
} from './types';

const NOW = new Date('2026-09-28T02:27:00Z');

type EmbedCall = { texts: string[]; at: number };

/** What one embedContent call does: 'ok' embeds the batch, anything else is thrown. */
type Decide = (call: EmbedCall, index: number) => unknown;

/** A vector that says which input it belongs to: the one at `doc-3` points along axis 3. */
const vectorFor = (text: string) => {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);

  vector[Number(/doc-(\d+)/.exec(text)?.[1] ?? 0)] = 1;

  return vector;
};

const axisOf = (vector: number[]) => vector.indexOf(1);

const fakeEmbedClient = (decide: Decide) => {
  const calls: EmbedCall[] = [];

  const embedContent = async (params: { contents: { parts: { text: string }[] }[] }) => {
    const call = {
      texts: params.contents.map((content) => content.parts[0]!.text),
      at: Date.now(),
    };

    calls.push(call);

    const outcome = decide(call, calls.length - 1);

    if (outcome !== 'ok') {
      throw outcome;
    }

    return { embeddings: call.texts.map((text) => ({ values: vectorFor(text) })) };
  };

  return {
    calls,
    client: { models: { embedContent } } as unknown as Pick<GoogleGenAI, 'models'>,
  };
};

const setup = (decide: Decide, options: Partial<GeminiOptions> = {}) => {
  const fake = fakeEmbedClient(decide);
  const provider = createGeminiProvider({
    apiKey: 'test',
    embeddingModel: 'gemini-embedding-2',
    clientImpl: fake.client,
    ...options,
  });

  return { ...fake, provider, sizes: () => fake.calls.map((call) => call.texts.length) };
};

const docs = (count: number): EmbedInput[] =>
  Array.from({ length: count }, (_, index) => ({ title: 'Guide', text: `doc-${index}` }));

/** Settles a promise into a value, so a rejection is never unhandled while timers run. */
const settle = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

/** Whether a promise has settled yet, without waiting on it. */
const isSettled = async (promise: Promise<unknown>) => {
  const marker = Symbol('pending');

  return (await Promise.race([promise, Promise.resolve(marker)])) !== marker;
};

describe('Gemini embeddings under quota limits', () => {
  let info: MockInstance<typeof console.info>;
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    info.mockRestore();
    warn.mockRestore();
    forgetDailyLimits();
  });

  describe('while indexing', () => {
    it('waits out a per-minute quota as long as Gemini suggests, then carries on', async () => {
      const { calls, provider } = setup((_, index) => (index === 0 ? minuteLimit('37s') : 'ok'));
      const done = settle(provider.embed(docs(1), 'document'));

      await vi.advanceTimersByTimeAsync(37_000 + QUOTA_WAIT_MARGIN_MS - 1);
      expect(calls).toHaveLength(1);
      expect(await isSettled(done)).toBe(false);

      await vi.advanceTimersByTimeAsync(1);

      const outcome = await done;

      expect(outcome.ok && outcome.value.map(axisOf)).toEqual([0]);
      expect(calls).toHaveLength(2);
      expect(calls[1]!.at - calls[0]!.at).toBe(37_000 + QUOTA_WAIT_MARGIN_MS);
    });

    it('waits no more than a minute at a time, however long the suggestion', async () => {
      const { calls, provider } = setup((_, index) => (index === 0 ? minuteLimit('150s') : 'ok'));
      const done = settle(provider.embed(docs(1), 'document'));

      await vi.advanceTimersByTimeAsync(MAX_QUOTA_WAIT_MS);

      expect((await done).ok).toBe(true);
      expect(calls[1]!.at - calls[0]!.at).toBe(MAX_QUOTA_WAIT_MS);
    });

    it('doubles its waits when Gemini suggests no delay', async () => {
      const { calls, provider } = setup((_, index) => (index < 3 ? minuteLimit(null) : 'ok'));
      const done = settle(provider.embed(docs(1), 'document'));

      await vi.advanceTimersByTimeAsync(60_000);

      expect((await done).ok).toBe(true);
      expect(calls.slice(1).map((call, index) => call.at - calls[index]!.at)).toEqual([
        5000, 10_000, 20_000,
      ]);
    });

    it('splits a batch the minute has no room for, while single texts pass', async () => {
      const { provider, sizes } = setup((call) =>
        call.texts.length > 2 ? minuteLimit('37s') : 'ok',
      );

      const vectors = await provider.embed(docs(5), 'document');

      // Nothing waited: halving found a size that fits.
      expect(sizes()).toEqual([5, 3, 2, 2, 1]);
      expect(vectors.map(axisOf)).toEqual([0, 1, 2, 3, 4]);
    });

    it('indexes more texts than a minute allows by splitting and waiting in turn', async () => {
      // Two texts a minute, as Gemini counts them: every text in a batch counts.
      const used = new Map<number, number>();
      const { calls, provider, sizes } = setup((call) => {
        const minute = Math.floor(call.at / 60_000);
        const count = used.get(minute) ?? 0;

        if (count + call.texts.length > 2) {
          const rest = Math.ceil(((minute + 1) * 60_000 - call.at) / 1000);

          return minuteLimit(`${rest}s`);
        }

        used.set(minute, count + call.texts.length);

        return 'ok';
      });
      const done = settle(provider.embed(docs(5), 'document', { deadline: Date.now() + 270_000 }));

      await vi.advanceTimersByTimeAsync(3 * 60_000);

      const outcome = await done;

      expect(outcome.ok && outcome.value.map(axisOf)).toEqual([0, 1, 2, 3, 4]);
      // A refused batch is halved at once; a single text refused waits for the next minute, and
      // then full batches are tried again.
      expect(sizes()).toEqual([5, 3, 2, 2, 1, 3, 2, 1, 1]);
      expect(new Set(calls.map((call) => Math.floor(call.at / 60_000))).size).toBe(3);
    });

    it('reports busy instead of waiting past the deadline it was given', async () => {
      const { calls, provider } = setup(() => minuteLimit('37s'));
      const done = settle(provider.embed(docs(1), 'document', { deadline: Date.now() + 30_000 }));

      await vi.advanceTimersByTimeAsync(0);

      const outcome = await done;

      expect(!outcome.ok && outcome.error).toBeInstanceOf(ModelBusyError);
      expect(calls).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('waits while the deadline allows and gives up at the wait that would pass it', async () => {
      const { calls, provider } = setup(() => minuteLimit('20s'));
      const done = settle(provider.embed(docs(1), 'document', { deadline: Date.now() + 50_000 }));

      await vi.advanceTimersByTimeAsync(60_000);

      const outcome = await done;

      expect(!outcome.ok && outcome.error).toBeInstanceOf(ModelBusyError);
      // Two waits of 21 s fit in 50 s; a third would end at 63 s.
      expect(calls).toHaveLength(3);
    });
  });

  describe('at the daily cap', () => {
    it('stops at once, without a retry, a split or a wait, and says when it resets', async () => {
      const { calls, provider } = setup(() => dailyLimit());
      const done = settle(provider.embed(docs(5), 'document'));

      await vi.advanceTimersByTimeAsync(0);

      const outcome = await done;
      const error = !outcome.ok ? (outcome.error as ProviderLimitError) : null;

      expect(error).toBeInstanceOf(ProviderLimitError);
      expect(error).toMatchObject({
        scope: 'day',
        quotaId: 'EmbedContentRequestsPerDayPerProjectPerModel-FreeTier',
        models: ['gemini-embedding-2'],
      });
      expect(error!.resetAt).toEqual(new Date('2026-09-28T07:00:00Z'));
      expect(calls).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
      expect(activeDailyLimit()).toEqual({
        kind: 'embedding',
        seenAt: NOW,
        resetAt: nextDailyReset(NOW),
      });
    });

    it('stops a question the same way', async () => {
      const { calls, provider } = setup(() => dailyLimit());
      const outcome = await settle(provider.embed([{ text: 'Where are keys?' }], 'query'));

      expect(!outcome.ok && outcome.error).toMatchObject({ scope: 'day' });
      expect(calls).toHaveLength(1);
    });

    it('forgets the cap once an embedding goes through again', async () => {
      const { provider } = setup((_, index) => (index === 0 ? dailyLimit() : 'ok'));

      await settle(provider.embed(docs(1), 'document'));
      expect(activeDailyLimit()?.kind).toBe('embedding');

      await provider.embed(docs(1), 'document');
      expect(activeDailyLimit()).toBeNull();
    });
  });

  describe('for a question', () => {
    const question = [{ text: 'Where do I create an API key?' }];

    it('gives up at once when the quota needs longer than a reader waits', async () => {
      const { calls, provider } = setup(() => minuteLimit('37s'));
      const done = settle(provider.embed(question, 'query'));

      await vi.advanceTimersByTimeAsync(0);

      const outcome = await done;

      expect(!outcome.ok && outcome.error).toBeInstanceOf(ModelBusyError);
      expect(calls).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('waits once, briefly, when the quota frees in a moment', async () => {
      const { calls, provider } = setup((_, index) => (index === 0 ? minuteLimit('1s') : 'ok'));
      const done = settle(provider.embed(question, 'query'));

      await vi.advanceTimersByTimeAsync(QUERY_QUOTA_WAIT_MS);

      expect((await done).ok).toBe(true);
      expect(calls[1]!.at - calls[0]!.at).toBe(1000 + QUOTA_WAIT_MARGIN_MS);
    });

    it('does not wait a second time', async () => {
      const { calls, provider } = setup(() => minuteLimit('1s'));
      const done = settle(provider.embed(question, 'query'));

      await vi.advanceTimersByTimeAsync(QUERY_QUOTA_WAIT_MS * 3);

      const outcome = await done;

      expect(!outcome.ok && outcome.error).toBeInstanceOf(ModelBusyError);
      expect(calls).toHaveLength(2);
    });

    it('keeps an unexplained refusal to a short wait too', async () => {
      const { calls, provider } = setup((_, index) => (index === 0 ? minuteLimit(null) : 'ok'));
      const done = settle(provider.embed(question, 'query'));

      await vi.advanceTimersByTimeAsync(QUERY_QUOTA_WAIT_MS);

      expect((await done).ok).toBe(true);
      expect(calls[1]!.at - calls[0]!.at).toBeLessThanOrEqual(QUERY_QUOTA_WAIT_MS);
    });
  });

  describe('on server errors', () => {
    const serverError = (status: number) =>
      Object.assign(new Error(`The model returned ${status}.`), { status });

    it('keeps the per-attempt backoff for 5xx', async () => {
      const waits: number[] = [];
      const { calls, provider } = setup((_, index) => (index < 2 ? serverError(503) : 'ok'), {
        waitImpl: (ms) => {
          waits.push(ms);

          return Promise.resolve();
        },
      });

      expect((await provider.embed(docs(1), 'document')).map(axisOf)).toEqual([0]);
      expect(calls).toHaveLength(3);
      expect(waits).toHaveLength(2);
      // 800 ms doubling, with jitter in the upper half.
      expect(waits[0]).toBeGreaterThanOrEqual(400);
      expect(waits[0]).toBeLessThanOrEqual(800);
      expect(waits[1]).toBeGreaterThanOrEqual(800);
      expect(waits[1]).toBeLessThanOrEqual(1600);
    });

    it('reports a model that stays overloaded as busy after four attempts', async () => {
      const { calls, provider } = setup(() => serverError(503), {
        waitImpl: () => Promise.resolve(),
      });

      await expect(provider.embed(docs(1), 'document')).rejects.toBeInstanceOf(ModelBusyError);
      expect(calls).toHaveLength(4);
    });

    it('does not retry a request the provider refused as malformed', async () => {
      const { calls, provider } = setup(() => serverError(400));

      await expect(provider.embed(docs(1), 'document')).rejects.toBeInstanceOf(ProviderError);
      expect(calls).toHaveLength(1);
    });
  });
});
