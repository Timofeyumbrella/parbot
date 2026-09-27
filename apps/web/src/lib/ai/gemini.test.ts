// @vitest-environment node
import { ThinkingLevel, type GoogleGenAI } from '@google/genai';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import {
  createGeminiProvider,
  DEFAULT_FIRST_CHUNK_DEADLINE_MS,
  firstChunkDeadlineFrom,
  type GeminiOptions,
} from './gemini';
import { activeDailyLimit, forgetDailyLimits } from './quota';
import { DAILY_CHAT_QUOTA, dailyLimit, MINUTE_CHAT_QUOTA, minuteLimit } from './quota.fixtures';
import {
  type GenerateChunk,
  type GenerateInput,
  type GenerateResult,
  ModelBusyError,
  ProviderError,
  ProviderLimitError,
} from './types';

const PRIMARY = 'gemini-3.5-flash-lite';
const SECOND = 'gemini-3.1-flash-lite';
const LAST = 'gemini-3.5-flash';

/** What one call to a model does. */
type Script =
  | {
      /** Milliseconds before the first chunk. */
      delay: number;
      chunks?: string[];
      usage?: { prompt: number; completion: number };
      /** Thrown after the first chunk. */
      failAfterFirst?: boolean;
    }
  | { delay?: number; status: number }
  /** Thrown as it is, such as a quota refusal with its body. */
  | { delay?: number; error: unknown };

type Call = {
  model: string;
  signal: AbortSignal;
  config: Record<string, unknown>;
};

const abortError = () => new DOMException('This operation was aborted', 'AbortError');

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());

      return;
    }

    const timer = setTimeout(resolve, ms);

    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });

const apiError = (status: number) =>
  Object.assign(new Error(`The model returned ${status}.`), { status });

const chunk = (text: string, usage?: { prompt: number; completion: number }) => ({
  candidates: [{ content: { parts: [{ text }] } }],
  ...(usage
    ? { usageMetadata: { promptTokenCount: usage.prompt, candidatesTokenCount: usage.completion } }
    : {}),
});

/**
 * A client whose models follow scripts, one per call and the last one repeated. A stalled model
 * is one whose first chunk takes long; aborting the call rejects it the way fetch does.
 */
const fakeClient = (scripts: Record<string, Script[]>) => {
  const calls: Call[] = [];
  const used = new Map<string, number>();

  const generateContentStream = async (params: {
    model: string;
    config: Record<string, unknown> & { abortSignal: AbortSignal };
  }) => {
    const { model, config } = params;
    const signal = config.abortSignal;
    const list = scripts[model] ?? [{ status: 404 }];
    const count = used.get(model) ?? 0;
    const script = list[Math.min(count, list.length - 1)]!;

    used.set(model, count + 1);
    calls.push({ model, signal, config });

    if ('status' in script) {
      await sleep(script.delay ?? 0, signal);
      throw apiError(script.status);
    }

    if ('error' in script) {
      await sleep(script.delay ?? 0, signal);
      throw script.error;
    }

    return (async function* () {
      await sleep(script.delay, signal);

      const chunks = script.chunks ?? [`Answer from ${model}.`];

      for (let index = 0; index < chunks.length; index += 1) {
        const last = index === chunks.length - 1;

        yield chunk(chunks[index]!, last ? script.usage : undefined);

        if (script.failAfterFirst) {
          throw apiError(500);
        }

        await sleep(10, signal);
      }
    })();
  };

  return {
    calls,
    client: { models: { generateContentStream } } as unknown as Pick<GoogleGenAI, 'models'>,
  };
};

const input = (signal?: AbortSignal): GenerateInput => ({
  system: 'Answer from the sources.',
  turns: [{ role: 'user', text: 'Sources:\n[1] Keys\nKeys live in Settings.\n\nQuestion: Where?' }],
  signal,
});

/** Runs the stream to its end, whatever that is, without an unhandled rejection meanwhile. */
const drain = (stream: AsyncGenerator<GenerateChunk, GenerateResult>) => {
  const chunks: string[] = [];

  return (async () => {
    while (true) {
      const next = await stream.next();

      if (next.done) {
        return { chunks, result: next.value };
      }

      chunks.push(next.value.text);
    }
  })().then(
    (value) => ({ ok: true as const, ...value }),
    (error: unknown) => ({ ok: false as const, error, chunks }),
  );
};

const setup = (scripts: Record<string, Script[]>, options: Partial<GeminiOptions> = {}) => {
  const fake = fakeClient(scripts);
  const waits: number[] = [];
  const provider = createGeminiProvider({
    apiKey: 'test',
    chatModel: PRIMARY,
    fallbackModels: [SECOND, LAST],
    thinkingLevel: 'MINIMAL',
    clientImpl: fake.client,
    waitImpl: (ms) => {
      waits.push(ms);

      return Promise.resolve();
    },
    ...options,
  });

  return { ...fake, waits, provider };
};

const models = (calls: Call[]) => calls.map((call) => call.model);

describe('the Gemini chat stream', () => {
  let info: MockInstance<typeof console.info>;

  beforeEach(() => {
    vi.useFakeTimers();
    info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    info.mockRestore();
    forgetDailyLimits();
  });

  const hedgeLogs = () =>
    info.mock.calls.map((args) => String(args[0])).filter((line) => line.includes('hedge'));

  it('never starts a second model when the first answers quickly', async () => {
    const { calls, provider } = setup({
      [PRIMARY]: [
        {
          delay: 500,
          chunks: ['Keys live ', 'in Settings [1].'],
          usage: { prompt: 40, completion: 6 },
        },
      ],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(outcome.ok && outcome.chunks.join('')).toBe('Keys live in Settings [1].');
    expect(outcome.ok && outcome.result).toEqual({
      model: PRIMARY,
      promptTokens: 40,
      completionTokens: 6,
    });
    expect(models(calls)).toEqual([PRIMARY]);
    expect(hedgeLogs()).toEqual([]);
  });

  it('starts the next model beside a stalled one, and the faster one wins', async () => {
    const { calls, provider } = setup({
      [PRIMARY]: [{ delay: 20_000 }],
      [SECOND]: [
        { delay: 400, chunks: ['From the second.'], usage: { prompt: 41, completion: 4 } },
      ],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(DEFAULT_FIRST_CHUNK_DEADLINE_MS - 1);
    expect(models(calls)).toEqual([PRIMARY]);

    await vi.advanceTimersByTimeAsync(1);
    expect(models(calls)).toEqual([PRIMARY, SECOND]);
    // The stalled model keeps running while the next one is tried.
    expect(calls[0]!.signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(400);
    // The loser is aborted as soon as the winner's first chunk is in.
    expect(calls[0]!.signal.aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(outcome.ok && outcome.chunks).toEqual(['From the second.']);
    // Usage and model are the winner's.
    expect(outcome.ok && outcome.result).toEqual({
      model: SECOND,
      promptTokens: 41,
      completionTokens: 4,
    });
    expect(models(calls)).toEqual([PRIMARY, SECOND]);
    expect(calls[1]!.signal.aborted).toBe(false);
    // Both calls asked for the same thinking level.
    for (const call of calls) {
      expect(call.config.thinkingConfig).toEqual({ thinkingLevel: ThinkingLevel.MINIMAL });
    }
    expect(hedgeLogs()).toEqual([
      expect.stringContaining(
        `${PRIMARY} sent no first chunk in ${DEFAULT_FIRST_CHUNK_DEADLINE_MS} ms`,
      ),
      expect.stringMatching(
        new RegExp(
          `hedge won by ${SECOND}: first chunk 3900 ms after the question.*aborted ${PRIMARY}`,
        ),
      ),
    ]);
  });

  it('keeps the first model in the race, and aborts the second when the first answers sooner', async () => {
    const { calls, provider } = setup({
      [PRIMARY]: [
        { delay: 4000, chunks: ['From the primary.'], usage: { prompt: 40, completion: 4 } },
      ],
      [SECOND]: [{ delay: 2000 }],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(4000);
    expect(models(calls)).toEqual([PRIMARY, SECOND]);
    expect(calls[1]!.signal.aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(outcome.ok && outcome.result).toEqual({
      model: PRIMARY,
      promptTokens: 40,
      completionTokens: 4,
    });
    expect(outcome.ok && outcome.chunks).toEqual(['From the primary.']);
    expect(models(calls)).toEqual([PRIMARY, SECOND]);
    expect(hedgeLogs().at(-1)).toContain(`hedge won by ${PRIMARY}`);
  });

  it('aborts every request in flight when the reader stops during a hedge', async () => {
    const { calls, provider } = setup({
      [PRIMARY]: [{ delay: 20_000 }],
      [SECOND]: [{ delay: 20_000 }],
    });
    const reader = new AbortController();

    const done = drain(provider.stream(input(reader.signal)));

    await vi.advanceTimersByTimeAsync(4000);
    expect(models(calls)).toEqual([PRIMARY, SECOND]);

    reader.abort();
    await vi.advanceTimersByTimeAsync(0);

    const outcome = await done;

    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && (outcome.error as Error).name).toBe('AbortError');
    expect(calls.every((call) => call.signal.aborted)).toBe(true);

    // Nothing else is started after the stop.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(models(calls)).toEqual([PRIMARY, SECOND]);
  });

  it('gives the last model in the chain no deadline', async () => {
    const { calls, provider } = setup({
      [PRIMARY]: [{ delay: 60_000 }],
      [SECOND]: [{ delay: 60_000 }],
      [LAST]: [{ delay: 15_000, chunks: ['From the last.'] }],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(DEFAULT_FIRST_CHUNK_DEADLINE_MS);
    expect(models(calls)).toEqual([PRIMARY, SECOND]);

    await vi.advanceTimersByTimeAsync(DEFAULT_FIRST_CHUNK_DEADLINE_MS);
    expect(models(calls)).toEqual([PRIMARY, SECOND, LAST]);

    // Well past another deadline: nothing new starts while the last model takes its time.
    await vi.advanceTimersByTimeAsync(14_000);
    expect(models(calls)).toEqual([PRIMARY, SECOND, LAST]);

    await vi.advanceTimersByTimeAsync(2000);

    const outcome = await done;

    expect(outcome.ok && outcome.result.model).toBe(LAST);
    expect(models(calls)).toEqual([PRIMARY, SECOND, LAST]);
    expect(calls[0]!.signal.aborted && calls[1]!.signal.aborted).toBe(true);
  });

  it('never hedges when the deadline is 0', async () => {
    const { calls, provider } = setup(
      { [PRIMARY]: [{ delay: 20_000, chunks: ['Slow but sure.'] }] },
      { firstChunkDeadlineMs: 0 },
    );

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(outcome.ok && outcome.result.model).toBe(PRIMARY);
    expect(models(calls)).toEqual([PRIMARY]);
    expect(hedgeLogs()).toEqual([]);
  });

  it('retries a busy model once and then falls back, as before hedging', async () => {
    const { calls, waits, provider } = setup({
      [PRIMARY]: [{ status: 503 }],
      [SECOND]: [{ delay: 300, chunks: ['From the second.'] }],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(outcome.ok && outcome.result.model).toBe(SECOND);
    expect(models(calls)).toEqual([PRIMARY, PRIMARY, SECOND]);
    expect(waits).toHaveLength(1);
    expect(hedgeLogs()).toEqual([]);
  });

  it('moves on without a retry when a model is missing', async () => {
    const { calls, waits, provider } = setup({
      [PRIMARY]: [{ status: 404 }],
      [SECOND]: [{ delay: 300 }],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(outcome.ok && outcome.result.model).toBe(SECOND);
    expect(models(calls)).toEqual([PRIMARY, SECOND]);
    expect(waits).toEqual([]);
  });

  it('gives a retry its own deadline', async () => {
    const { calls, provider } = setup({
      [PRIMARY]: [{ delay: 1000, status: 503 }, { delay: 3000 }],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(outcome.ok && outcome.result.model).toBe(PRIMARY);
    expect(models(calls)).toEqual([PRIMARY, PRIMARY]);
  });

  it('does not retry a model the chain already hedged past', async () => {
    const { calls, provider } = setup({
      [PRIMARY]: [{ delay: 5000, status: 503 }],
      [SECOND]: [{ delay: 3000, chunks: ['From the second.'] }],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(outcome.ok && outcome.result.model).toBe(SECOND);
    expect(models(calls)).toEqual([PRIMARY, SECOND]);
  });

  it('moves down the chain when the hedge fails, while the stalled model keeps running', async () => {
    const { calls, provider } = setup({
      [PRIMARY]: [{ delay: 10_000, chunks: ['From the primary.'] }],
      [SECOND]: [{ status: 404 }],
      [LAST]: [{ delay: 8000 }],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(DEFAULT_FIRST_CHUNK_DEADLINE_MS + 10);
    expect(models(calls)).toEqual([PRIMARY, SECOND, LAST]);

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(outcome.ok && outcome.result.model).toBe(PRIMARY);
    expect(calls[2]!.signal.aborted).toBe(true);
  });

  it('reports every model busy when each one refused with a capacity error', async () => {
    const { calls, provider } = setup({
      [PRIMARY]: [{ status: 429 }],
      [SECOND]: [{ status: 503 }],
      [LAST]: [{ status: 503 }],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(!outcome.ok && outcome.error).toBeInstanceOf(ModelBusyError);
    expect(models(calls)).toEqual([PRIMARY, PRIMARY, SECOND, SECOND, LAST, LAST]);
  });

  it('moves down the chain at once when a per-minute quota needs longer than a reader waits', async () => {
    const { calls, waits, provider } = setup({
      [PRIMARY]: [{ error: minuteLimit('37s', MINUTE_CHAT_QUOTA) }],
      [SECOND]: [{ delay: 300, chunks: ['From the second.'] }],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(outcome.ok && outcome.result.model).toBe(SECOND);
    expect(models(calls)).toEqual([PRIMARY, SECOND]);
    expect(waits).toEqual([]);
  });

  it('retries a model once when its per-minute quota frees in a moment', async () => {
    const { calls, waits, provider } = setup({
      [PRIMARY]: [{ error: minuteLimit('1s', MINUTE_CHAT_QUOTA) }, { delay: 300 }],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(outcome.ok && outcome.result.model).toBe(PRIMARY);
    expect(models(calls)).toEqual([PRIMARY, PRIMARY]);
    expect(waits).toEqual([2000]);
  });

  it('skips a model whose daily quota is spent, without a retry', async () => {
    const { calls, waits, provider } = setup({
      [PRIMARY]: [{ error: dailyLimit(DAILY_CHAT_QUOTA) }],
      [SECOND]: [{ delay: 300, chunks: ['From the second.'] }],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(outcome.ok && outcome.result.model).toBe(SECOND);
    expect(models(calls)).toEqual([PRIMARY, SECOND]);
    expect(waits).toEqual([]);
    // Answers went out, so the deployment is not paused.
    expect(activeDailyLimit()).toBeNull();
  });

  it('says answers are paused for the day when every model has spent its daily quota', async () => {
    vi.setSystemTime(new Date('2026-09-28T02:27:00Z'));

    const { calls, waits, provider } = setup({
      [PRIMARY]: [{ error: dailyLimit(DAILY_CHAT_QUOTA) }],
      [SECOND]: [{ error: dailyLimit(DAILY_CHAT_QUOTA) }],
      [LAST]: [{ error: dailyLimit(DAILY_CHAT_QUOTA) }],
    });

    const done = drain(provider.stream(input()));

    // Each refusal comes back at once; nothing waits between models.
    await vi.advanceTimersByTimeAsync(10);

    const outcome = await done;

    expect(!outcome.ok && outcome.error).toBeInstanceOf(ProviderLimitError);
    expect(!outcome.ok && outcome.error).toMatchObject({
      scope: 'day',
      quotaId: DAILY_CHAT_QUOTA,
      resetAt: new Date('2026-09-28T07:00:00Z'),
    });
    expect(models(calls)).toEqual([PRIMARY, SECOND, LAST]);
    expect(waits).toEqual([]);
    expect(activeDailyLimit()).toMatchObject({ kind: 'chat' });
  });

  it('reports busy, not paused, while a model left is only busy for the minute', async () => {
    const { provider } = setup({
      [PRIMARY]: [{ error: dailyLimit(DAILY_CHAT_QUOTA) }],
      [SECOND]: [{ status: 503 }],
      [LAST]: [{ error: minuteLimit('37s', MINUTE_CHAT_QUOTA) }],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(!outcome.ok && outcome.error).toBeInstanceOf(ModelBusyError);
    expect(activeDailyLimit()).toBeNull();
  });

  it('reports a provider error when the chain runs out on other errors', async () => {
    const { provider } = setup({
      [PRIMARY]: [{ status: 400 }],
      [SECOND]: [{ status: 400 }],
      [LAST]: [{ status: 400 }],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(!outcome.ok && outcome.error).toBeInstanceOf(ProviderError);
    expect(!outcome.ok && (outcome.error as ProviderError).status).toBe(400);
  });

  it('does not fall back once part of the answer went out', async () => {
    const { calls, provider } = setup({
      [PRIMARY]: [{ delay: 200, chunks: ['Half an', ' answer'], failAfterFirst: true }],
    });

    const done = drain(provider.stream(input()));

    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = await done;

    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toBeInstanceOf(ProviderError);
    expect(outcome.chunks).toEqual(['Half an']);
    expect(models(calls)).toEqual([PRIMARY]);
  });

  it('closes the request when the consumer walks away mid-answer', async () => {
    const { calls, provider } = setup({
      [PRIMARY]: [{ delay: 200, chunks: ['One', ' two', ' three'] }],
    });
    const stream = provider.stream(input());
    const first = stream.next();

    await vi.advanceTimersByTimeAsync(200);
    expect((await first).value).toEqual({ text: 'One' });

    await stream.return({ model: PRIMARY, promptTokens: 0, completionTokens: 0 });

    expect(calls[0]!.signal.aborted).toBe(true);
  });
});

describe('firstChunkDeadlineFrom', () => {
  it('reads whole milliseconds, 0 for off, and the default for anything else', () => {
    expect(firstChunkDeadlineFrom(undefined)).toBe(DEFAULT_FIRST_CHUNK_DEADLINE_MS);
    expect(firstChunkDeadlineFrom('  ')).toBe(DEFAULT_FIRST_CHUNK_DEADLINE_MS);
    expect(firstChunkDeadlineFrom('2500')).toBe(2500);
    expect(firstChunkDeadlineFrom(' 0 ')).toBe(0);
    expect(firstChunkDeadlineFrom('soon')).toBe(DEFAULT_FIRST_CHUNK_DEADLINE_MS);
    expect(firstChunkDeadlineFrom('-5')).toBe(DEFAULT_FIRST_CHUNK_DEADLINE_MS);
  });
});
