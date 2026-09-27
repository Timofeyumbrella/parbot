import { ApiError, GoogleGenAI, ThinkingLevel, type Content } from '@google/genai';

import { clearDailyLimit, nextDailyReset, noteDailyLimit, parseQuotaRefusal } from './quota';
import {
  type AiProvider,
  collectStream,
  EMBEDDING_DIMENSIONS,
  type EmbedInput,
  type EmbeddingKind,
  type EmbedOptions,
  type GenerateChunk,
  type GenerateInput,
  type GenerateResult,
  isDailyLimit,
  ModelBusyError,
  normalizeVector,
  ProviderError,
  ProviderLimitError,
} from './types';

// Flash-Lite starts answering in well under a second on the free tier; the larger Flash models
// took 8 to 19 seconds to their first token there (measured 2026-09-27), which no reader waits for.
const DEFAULT_CHAT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_FALLBACKS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];
const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-2';
const EMBED_BATCH_SIZE = 32;
const MAX_OUTPUT_TOKENS = 1024;
const TEMPERATURE = 0.2;

/** Statuses worth retrying on the same model before moving down the chain. */
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const BUSY_STATUSES = new Set([429, 503]);
const EMBED_ATTEMPTS = 4;
const CHAT_ATTEMPTS = 2;
const BASE_DELAY_MS = 800;
const MAX_DELAY_MS = 8000;
/**
 * The longest single wait for a per-minute quota while indexing. Gemini suggests the time until
 * the minute frees up, usually under a minute; the ingest's own deadline bounds the total.
 */
export const MAX_QUOTA_WAIT_MS = 60_000;
/** RetryInfo rounds down to whole seconds, so a wait of exactly that long can be a moment early. */
export const QUOTA_WAIT_MARGIN_MS = 1000;
/** The first wait for a per-minute refusal that suggested no delay; each further one doubles. */
export const DEFAULT_QUOTA_WAIT_MS = 5000;
/**
 * The most a question's embedding, or an answer's model, waits for a per-minute quota, and only
 * once: the reader is watching. A refusal that suggests longer is reported as busy at once.
 */
export const QUERY_QUOTA_WAIT_MS = 3000;
/** How long document embeddings may spend waiting on quotas when the caller set no deadline. */
export const DEFAULT_EMBED_WAIT_BUDGET_MS = 120_000;
/**
 * Most answers start in about 1.5 s, but on the free tier roughly one call in six stalled for 13 to
 * 23 s before its first token whatever the answer's length (measured on the live site 2026-09-28).
 * Past this, the next model starts beside the stalled one.
 */
export const DEFAULT_FIRST_CHUNK_DEADLINE_MS = 3500;

export type GeminiOptions = {
  apiKey: string;
  chatModel?: string;
  fallbackModels?: string[];
  embeddingModel?: string;
  thinkingLevel?: string;
  /**
   * How long a model may take to its first chunk before the next model in the chain starts beside
   * it. 0 turns hedging off, so a model is left only after an error.
   */
  firstChunkDeadlineMs?: number;
  /** Test hook: replaces the wait between retries. */
  waitImpl?: (ms: number) => Promise<void>;
  /** Test hook: replaces the SDK client. */
  clientImpl?: Pick<GoogleGenAI, 'models'>;
};

/** Reads GEMINI_FIRST_CHUNK_DEADLINE_MS: whole milliseconds, 0 for off, the default otherwise. */
export const firstChunkDeadlineFrom = (value: string | undefined) => {
  const text = value?.trim();

  if (!text) {
    return DEFAULT_FIRST_CHUNK_DEADLINE_MS;
  }

  const ms = Number(text);

  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : DEFAULT_FIRST_CHUNK_DEADLINE_MS;
};

/** One model's run in the race for the first chunk, retries included. */
type Lane = {
  /** Position in the chain. */
  index: number;
  model: string;
  startedAt: number;
  /** The request in flight. */
  controller: AbortController | null;
  /** The first-chunk deadline of the request in flight. */
  timer: ReturnType<typeof setTimeout> | null;
  /** The next model was started beside it, so an error ends it rather than retrying. */
  hedged: boolean;
  /** Failed or lost; nothing it does from now on counts. */
  over: boolean;
  opened: {
    generator: AsyncGenerator<GenerateChunk, GenerateResult>;
    first: IteratorResult<GenerateChunk, GenerateResult>;
    at: number;
  } | null;
};

type RaceEvent =
  | { type: 'opened'; lane: Lane }
  | { type: 'failed'; lane: Lane; cause: unknown }
  | { type: 'deadline'; lane: Lane }
  | { type: 'aborted' };

/** Lets lanes, timers and the reader's stop report in any order to the one loop that decides. */
const eventQueue = <T>() => {
  const items: T[] = [];
  let reader: ((item: T) => void) | null = null;

  return {
    push: (item: T) => {
      if (reader) {
        const resolve = reader;

        reader = null;
        resolve(item);
      } else {
        items.push(item);
      }
    },
    next: () =>
      items.length > 0
        ? Promise.resolve(items.shift()!)
        : new Promise<T>((resolve) => {
            reader = resolve;
          }),
  };
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const backoff = (attempt: number) => {
  const ceiling = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);

  return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
};

const statusOf = (cause: unknown) =>
  cause instanceof ApiError
    ? cause.status
    : typeof cause === 'object' && cause && 'status' in cause && typeof cause.status === 'number'
      ? cause.status
      : 0;

const isNetworkError = (cause: unknown) =>
  cause instanceof TypeError ||
  (cause instanceof Error && (cause.name === 'AbortError') === false && statusOf(cause) === 0);

/** A 429 as a typed error that says which quota ran out, or null for any other failure. */
const limitFrom = (cause: unknown, models: string[]): ProviderLimitError | null => {
  if (cause instanceof ProviderLimitError) {
    return cause;
  }

  const refusal = parseQuotaRefusal(cause);

  return refusal
    ? new ProviderLimitError({
        ...refusal,
        models,
        resetAt: refusal.scope === 'day' ? nextDailyReset() : null,
      })
    : null;
};

/**
 * The one short wait a reader can be kept on for a per-minute quota: the suggested delay when it
 * is short, a short backoff when none was given, and null when the quota needs longer to free.
 */
const shortQuotaWait = (limit: ProviderLimitError, attempt: number) => {
  if (limit.retryDelayMs === null) {
    return Math.min(backoff(attempt), QUERY_QUOTA_WAIT_MS);
  }

  return limit.retryDelayMs <= QUERY_QUOTA_WAIT_MS
    ? Math.min(limit.retryDelayMs + QUOTA_WAIT_MARGIN_MS, QUERY_QUOTA_WAIT_MS)
    : null;
};

/**
 * How long indexing waits for a per-minute quota: the suggested delay and a margin, capped per
 * wait; without a suggestion, waits that double. Null when the wait would end past the deadline.
 */
const documentQuotaWait = (limit: ProviderLimitError, waits: number, deadline: number) => {
  const suggested =
    limit.retryDelayMs === null
      ? DEFAULT_QUOTA_WAIT_MS * 2 ** waits
      : limit.retryDelayMs + QUOTA_WAIT_MARGIN_MS;
  const waitMs = Math.min(suggested, MAX_QUOTA_WAIT_MS);

  return Date.now() + waitMs <= deadline ? waitMs : null;
};

const thinkingLevelFrom = (value: string | undefined): ThinkingLevel => {
  switch ((value ?? 'MINIMAL').toUpperCase()) {
    case 'MINIMAL':
      return ThinkingLevel.MINIMAL;
    case 'MEDIUM':
      return ThinkingLevel.MEDIUM;
    case 'HIGH':
      return ThinkingLevel.HIGH;
    default:
      return ThinkingLevel.LOW;
  }
};

/** gemini-embedding-2 takes its task as plain text in front of the content. */
export const embeddingText = (input: EmbedInput, kind: EmbeddingKind) =>
  kind === 'query'
    ? `task: search result | query: ${input.text}`
    : `title: ${input.title?.trim() || 'Untitled'} | text: ${input.text}`;

export const createGeminiProvider = (options: GeminiOptions): AiProvider => {
  const client = options.clientImpl ?? new GoogleGenAI({ apiKey: options.apiKey });
  const waitFor = options.waitImpl ?? wait;
  const chatModels = [
    ...new Set([
      options.chatModel ?? DEFAULT_CHAT_MODEL,
      ...(options.fallbackModels ?? DEFAULT_FALLBACKS),
    ]),
  ].filter(Boolean);
  const embeddingModel = options.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  const thinkingLevel = thinkingLevelFrom(options.thinkingLevel);
  const firstChunkDeadlineMs = Math.max(
    0,
    options.firstChunkDeadlineMs ?? DEFAULT_FIRST_CHUNK_DEADLINE_MS,
  );

  /**
   * One batch, retried with backoff on server and network errors. A quota refusal comes back at
   * once as a ProviderLimitError: whether to wait, split the batch or stop is the caller's call.
   */
  const embedBatch = async (batch: EmbedInput[], kind: EmbeddingKind): Promise<number[][]> => {
    let lastError: unknown;

    for (let attempt = 0; attempt < EMBED_ATTEMPTS; attempt += 1) {
      try {
        const response = await client.models.embedContent({
          model: embeddingModel,
          contents: batch.map((input) => ({ parts: [{ text: embeddingText(input, kind) }] })),
          config: { outputDimensionality: EMBEDDING_DIMENSIONS },
        });

        const vectors = (response.embeddings ?? []).map((embedding) => embedding.values ?? []);

        if (vectors.length !== batch.length) {
          throw new ProviderError(
            502,
            `Expected ${batch.length} embeddings, received ${vectors.length}.`,
          );
        }

        return vectors.map((vector) => {
          if (vector.length !== EMBEDDING_DIMENSIONS) {
            throw new ProviderError(
              502,
              `Expected ${EMBEDDING_DIMENSIONS} dimensions, received ${vector.length}.`,
            );
          }

          return normalizeVector(vector);
        });
      } catch (cause) {
        const limit = limitFrom(cause, [embeddingModel]);

        if (limit) {
          throw limit;
        }

        lastError = cause;
        const status = statusOf(cause);

        if (!RETRY_STATUSES.has(status) && !isNetworkError(cause)) {
          throw cause instanceof ProviderError
            ? cause
            : new ProviderError(
                status || 500,
                cause instanceof Error ? cause.message : 'Embedding failed.',
              );
        }

        if (attempt < EMBED_ATTEMPTS - 1) {
          await waitFor(backoff(attempt));
        }
      }
    }

    const status = statusOf(lastError);

    if (BUSY_STATUSES.has(status)) {
      throw new ModelBusyError([embeddingModel]);
    }

    throw new ProviderError(
      status || 500,
      lastError instanceof Error ? lastError.message : 'Embedding failed.',
    );
  };

  /**
   * Embeds in batches and deals with quotas. The day's cap stops at once: nothing passes before
   * the reset. A per-minute refusal first halves the batch, since every text in it counts toward
   * the quota and a smaller one may still fit this minute; a single text refused is waited out,
   * for documents as long as the deadline allows, for a question once and briefly.
   */
  const embed = async (inputs: EmbedInput[], kind: EmbeddingKind, options: EmbedOptions = {}) => {
    const vectors: number[][] = [];
    const deadline = options.deadline ?? Date.now() + DEFAULT_EMBED_WAIT_BUDGET_MS;
    let size = EMBED_BATCH_SIZE;
    let waits = 0;

    for (let start = 0; start < inputs.length;) {
      const batch = inputs.slice(start, start + size);

      try {
        vectors.push(...(await embedBatch(batch, kind)));
        start += batch.length;
        clearDailyLimit('embedding');
        continue;
      } catch (cause) {
        if (!(cause instanceof ProviderLimitError)) {
          throw cause;
        }

        if (isDailyLimit(cause)) {
          noteDailyLimit('embedding', cause.resetAt);
          console.warn(
            `[ai] ${embeddingModel}: the daily quota is spent (${cause.quotaId ?? 'unnamed'}); embeddings stop until ${cause.resetAt.toISOString()}`,
          );
          throw cause;
        }

        if (batch.length > 1) {
          size = Math.ceil(batch.length / 2);
          console.info(
            `[ai] ${embeddingModel}: a batch of ${batch.length} was over the per-minute quota (${cause.quotaId ?? 'unnamed'}); trying ${size}`,
          );
          continue;
        }

        const waitMs =
          kind === 'query'
            ? waits === 0
              ? shortQuotaWait(cause, 1)
              : null
            : documentQuotaWait(cause, waits, deadline);

        if (waitMs === null) {
          console.warn(
            `[ai] ${embeddingModel}: the per-minute quota (${cause.quotaId ?? 'unnamed'}) needs ${cause.retryDelayMs ?? 'an unknown number of'} ms to free, more than this ${kind} embedding can wait`,
          );
          throw new ModelBusyError([embeddingModel]);
        }

        console.info(
          `[ai] ${embeddingModel}: the per-minute quota is spent (${cause.quotaId ?? 'unnamed'}); waiting ${waitMs} ms`,
        );
        await waitFor(waitMs);
        waits += 1;
        // A new minute: full batches may fit again.
        size = EMBED_BATCH_SIZE;
      }
    }

    return vectors;
  };

  const streamModel = async function* (
    model: string,
    input: GenerateInput,
  ): AsyncGenerator<GenerateChunk, GenerateResult> {
    const contents: Content[] = input.turns.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    }));

    const response = await client.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: input.system,
        temperature: TEMPERATURE,
        maxOutputTokens: input.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
        abortSignal: input.signal,
        ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel } } : {}),
      },
    });

    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      const text = parts
        .filter((part) => !part.thought)
        .map((part) => part.text ?? '')
        .join('');

      if (chunk.usageMetadata) {
        promptTokens = chunk.usageMetadata.promptTokenCount ?? promptTokens;
        completionTokens = chunk.usageMetadata.candidatesTokenCount ?? completionTokens;
      }

      if (text) {
        yield { text };
      }
    }

    return { model, promptTokens, completionTokens };
  };

  /**
   * Waits for the first chunk of an answer. The chain's first model starts alone; when a model
   * sends nothing within the deadline, the next one starts beside it, and the first to send a
   * chunk wins while the others are aborted. The last model has no deadline: there is nothing
   * left to hedge with. An error retries the same model and then moves down the chain, as it did
   * before hedging, except that a model already hedged past is not retried.
   */
  const race = async (input: GenerateInput): Promise<Lane> => {
    input.signal?.throwIfAborted();

    const startedAt = Date.now();
    const events = eventQueue<RaceEvent>();
    const lanes: Lane[] = [];
    const busy: string[] = [];
    /** Models whose daily quota is spent. Each model has its own, so the chain goes on. */
    const capped: ProviderLimitError[] = [];
    const last = chatModels.length - 1;
    let lastError: unknown;
    let winner: Lane | null = null;

    const clearTimer = (lane: Lane) => {
      if (lane.timer) {
        clearTimeout(lane.timer);
        lane.timer = null;
      }
    };

    const run = async (lane: Lane) => {
      for (let attempt = 0; ; attempt += 1) {
        const controller = new AbortController();
        // Every request hears the reader's stop as well as its own lane's abort.
        const signal = input.signal
          ? AbortSignal.any([input.signal, controller.signal])
          : controller.signal;

        lane.controller = controller;

        if (firstChunkDeadlineMs > 0 && lane.index < last) {
          lane.timer = setTimeout(
            () => events.push({ type: 'deadline', lane }),
            firstChunkDeadlineMs,
          );
        }

        try {
          const generator = streamModel(lane.model, { ...input, signal });
          const first = await generator.next();

          clearTimer(lane);

          if (!lane.over) {
            lane.opened = { generator, first, at: Date.now() };
            events.push({ type: 'opened', lane });
          }

          return;
        } catch (cause) {
          clearTimer(lane);

          if (lane.over) {
            return;
          }

          const status = statusOf(cause);
          const limit = limitFrom(cause, [lane.model]);

          if (limit && isDailyLimit(limit)) {
            // Nothing this model does passes before the reset; the next model has its own quota.
            capped.push(limit);
            events.push({ type: 'failed', lane, cause: limit });

            return;
          }

          if (BUSY_STATUSES.has(status) && !busy.includes(lane.model)) {
            busy.push(lane.model);
          }

          // A 400 or 404 on one model usually means the model, not the request: try the next.
          const retryable = RETRY_STATUSES.has(status) || isNetworkError(cause);
          // A per-minute quota that needs longer than a reader waits is left for the next model.
          const waitMs = limit ? shortQuotaWait(limit, attempt) : backoff(attempt);

          if (
            input.signal?.aborted ||
            !retryable ||
            lane.hedged ||
            attempt >= CHAT_ATTEMPTS - 1 ||
            waitMs === null
          ) {
            events.push({ type: 'failed', lane, cause });

            return;
          }

          await waitFor(waitMs);

          if (lane.over) {
            return;
          }

          if (lane.hedged) {
            events.push({ type: 'failed', lane, cause });

            return;
          }
        }
      }
    };

    const start = (index: number) => {
      const lane: Lane = {
        index,
        model: chatModels[index]!,
        startedAt: Date.now(),
        controller: null,
        timer: null,
        hedged: false,
        over: false,
        opened: null,
      };

      lanes.push(lane);
      void run(lane);
    };

    const onAbort = () => events.push({ type: 'aborted' });

    input.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      start(0);

      while (true) {
        const event = await events.next();

        if (event.type === 'aborted') {
          throw input.signal?.reason ?? new DOMException('The answer was stopped.', 'AbortError');
        }

        const { lane } = event;

        if (event.type === 'opened') {
          winner = lane;
          clearDailyLimit('chat');

          if (lanes.some((other) => other.hedged)) {
            const aborted = lanes.filter((other) => other !== lane && !other.over);

            console.info(
              `[ai] hedge won by ${lane.model}: first chunk ${lane.opened!.at - startedAt} ms after the question, ${lane.opened!.at - lane.startedAt} ms after it started; aborted ${aborted.map((other) => other.model).join(', ') || 'none'}`,
            );
          }

          return lane;
        }

        const frontier = lanes.at(-1)!;

        if (event.type === 'deadline') {
          // A late timer for a model that has since answered, failed or been hedged past.
          if (lane !== frontier || lane.over || lane.opened) {
            continue;
          }

          lane.hedged = true;
          console.info(
            `[ai] hedge: ${lane.model} sent no first chunk in ${firstChunkDeadlineMs} ms (${Date.now() - startedAt} ms after the question); starting ${chatModels[lane.index + 1]} beside it`,
          );
          start(lane.index + 1);
          continue;
        }

        lane.over = true;
        lastError = event.cause;

        if (input.signal?.aborted) {
          throw event.cause;
        }

        if (lane === frontier && lane.index < last) {
          start(lane.index + 1);
          continue;
        }

        if (lanes.every((other) => other.over)) {
          break;
        }
      }
    } finally {
      input.signal?.removeEventListener('abort', onAbort);

      for (const lane of lanes) {
        clearTimer(lane);

        if (lane !== winner) {
          lane.over = true;
          lane.controller?.abort();
        }
      }
    }

    const cappedModels = new Set(capped.map((limit) => limit.models[0]));

    if (cappedModels.size === chatModels.length) {
      const resetAt = nextDailyReset();

      noteDailyLimit('chat', resetAt);
      console.warn(
        `[ai] every chat model's daily quota is spent (${chatModels.join(', ')}); answers stop until ${resetAt.toISOString()}`,
      );

      throw new ProviderLimitError({
        scope: 'day',
        retryDelayMs: null,
        quotaId: capped[0]?.quotaId ?? null,
        models: chatModels,
        resetAt,
      });
    }

    // A model that is only capped for the day counts as busy beside ones that are busy for the
    // minute: the chain as a whole comes back when those do.
    const refused = new Set([...busy, ...cappedModels]);

    if (refused.size === chatModels.length) {
      throw new ModelBusyError([...refused]);
    }

    throw new ProviderError(
      statusOf(lastError) || 500,
      lastError instanceof Error ? lastError.message : 'No model could answer.',
    );
  };

  const stream = async function* (
    input: GenerateInput,
  ): AsyncGenerator<GenerateChunk, GenerateResult> {
    const lane = await race(input);
    const { generator, first } = lane.opened!;
    let finished = false;

    try {
      if (first.done) {
        finished = true;

        return first.value;
      }

      yield first.value;

      while (true) {
        const next = await generator.next();

        if (next.done) {
          finished = true;

          return next.value;
        }

        yield next.value;
      }
    } catch (cause) {
      finished = true;

      if (input.signal?.aborted) {
        throw cause;
      }

      throw new ProviderError(
        statusOf(cause) || 500,
        cause instanceof Error ? cause.message : 'The model stopped mid-answer.',
      );
    } finally {
      // A consumer that walks away mid-answer closes the request rather than leaving it streaming.
      if (!finished) {
        lane.controller?.abort();
      }
    }
  };

  return {
    name: 'gemini',
    embed,
    stream,
    generate: (input) => collectStream(stream(input)),
  };
};
