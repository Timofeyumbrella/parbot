import { ApiError, GoogleGenAI, ThinkingLevel, type Content } from '@google/genai';

import {
  type AiProvider,
  collectStream,
  EMBEDDING_DIMENSIONS,
  type EmbedInput,
  type EmbeddingKind,
  type GenerateChunk,
  type GenerateInput,
  type GenerateResult,
  ModelBusyError,
  normalizeVector,
  ProviderError,
} from './types';

const DEFAULT_CHAT_MODEL = 'gemini-3.8-flash';
const DEFAULT_FALLBACKS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite'];
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

export type GeminiOptions = {
  apiKey: string;
  chatModel?: string;
  fallbackModels?: string[];
  embeddingModel?: string;
  thinkingLevel?: string;
  /** Test hook: replaces the wait between retries. */
  waitImpl?: (ms: number) => Promise<void>;
  /** Test hook: replaces the SDK client. */
  clientImpl?: Pick<GoogleGenAI, 'models'>;
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
  cause instanceof TypeError || (cause instanceof Error && cause.name === 'AbortError' === false && statusOf(cause) === 0);

const thinkingLevelFrom = (value: string | undefined): ThinkingLevel => {
  switch ((value ?? 'LOW').toUpperCase()) {
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
    ...new Set([options.chatModel ?? DEFAULT_CHAT_MODEL, ...(options.fallbackModels ?? DEFAULT_FALLBACKS)]),
  ].filter(Boolean);
  const embeddingModel = options.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  const thinkingLevel = thinkingLevelFrom(options.thinkingLevel);

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
          throw new ProviderError(502, `Expected ${batch.length} embeddings, received ${vectors.length}.`);
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
        lastError = cause;
        const status = statusOf(cause);

        if (!RETRY_STATUSES.has(status) && !isNetworkError(cause)) {
          throw cause instanceof ProviderError
            ? cause
            : new ProviderError(status || 500, cause instanceof Error ? cause.message : 'Embedding failed.');
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

    throw new ProviderError(status || 500, lastError instanceof Error ? lastError.message : 'Embedding failed.');
  };

  const embed = async (inputs: EmbedInput[], kind: EmbeddingKind) => {
    const vectors: number[][] = [];

    for (let start = 0; start < inputs.length; start += EMBED_BATCH_SIZE) {
      vectors.push(...(await embedBatch(inputs.slice(start, start + EMBED_BATCH_SIZE), kind)));
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

  const stream = async function* (input: GenerateInput): AsyncGenerator<GenerateChunk, GenerateResult> {
    const busy: string[] = [];
    let lastError: unknown;

    for (const model of chatModels) {
      for (let attempt = 0; attempt < CHAT_ATTEMPTS; attempt += 1) {
        let yielded = false;

        try {
          const generator = streamModel(model, input);

          while (true) {
            const next = await generator.next();

            if (next.done) {
              return next.value;
            }

            yielded = true;
            yield next.value;
          }
        } catch (cause) {
          if (input.signal?.aborted) {
            throw cause;
          }

          if (yielded) {
            throw new ProviderError(
              statusOf(cause) || 500,
              cause instanceof Error ? cause.message : 'The model stopped mid-answer.',
            );
          }

          lastError = cause;
          const status = statusOf(cause);

          if (BUSY_STATUSES.has(status) && !busy.includes(model)) {
            busy.push(model);
          }

          if (!RETRY_STATUSES.has(status) && !isNetworkError(cause)) {
            // A 400 or 404 on one model usually means the model, not the request: try the next.
            break;
          }

          if (attempt < CHAT_ATTEMPTS - 1) {
            await waitFor(backoff(attempt));
          }
        }
      }
    }

    if (busy.length === chatModels.length) {
      throw new ModelBusyError(busy);
    }

    throw new ProviderError(
      statusOf(lastError) || 500,
      lastError instanceof Error ? lastError.message : 'No model could answer.',
    );
  };

  return {
    name: 'gemini',
    embed,
    stream,
    generate: (input) => collectStream(stream(input)),
  };
};
