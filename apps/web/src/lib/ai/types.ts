export const EMBEDDING_DIMENSIONS = 1536;

export type EmbeddingKind = 'document' | 'query';

export type EmbedInput = {
  text: string;
  /** Document title, used as retrieval context for document embeddings. */
  title?: string;
};

export type ChatTurn = {
  role: 'user' | 'model';
  text: string;
};

export type GenerateInput = {
  system: string;
  turns: ChatTurn[];
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type GenerateChunk = { text: string };

export type GenerateResult = {
  model: string;
  promptTokens: number;
  completionTokens: number;
};

export type EmbedOptions = {
  /**
   * Epoch milliseconds by which a document embedding must be done waiting: a per-minute limit
   * whose wait would end later is reported as busy instead. Query embeddings ignore it; they
   * wait a few seconds at most.
   */
  deadline?: number;
};

export interface AiProvider {
  readonly name: 'gemini' | 'stub';
  /** One vector per input, `EMBEDDING_DIMENSIONS` long and unit length. */
  embed(inputs: EmbedInput[], kind: EmbeddingKind, options?: EmbedOptions): Promise<number[][]>;
  /** Streams the answer text; the return value carries the model and token counts. */
  stream(input: GenerateInput): AsyncGenerator<GenerateChunk, GenerateResult>;
  generate(input: GenerateInput): Promise<GenerateResult & { text: string }>;
}

/** Every model in the chain refused with a capacity error (429 or 503). */
export class ModelBusyError extends Error {
  readonly models: string[];

  constructor(models: string[]) {
    super(
      models.length > 1
        ? `The models ${models.join(', ')} are busy right now. Try again in a moment.`
        : `The model ${models[0] ?? ''} is busy right now. Try again in a moment.`,
    );
    this.name = 'ModelBusyError';
    this.models = models;
  }
}

export class ProviderError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

/** Which quota a refusal ran into: a per-minute burst that passes, or the day's cap. */
export type QuotaScope = 'minute' | 'day';

/**
 * The provider refused because a quota is spent (HTTP 429). A per-minute refusal is waited out
 * or reported as busy; a per-day one stops everything until `resetAt`. The message names the
 * model and quota for the log and never reaches a reader.
 */
export class ProviderLimitError extends ProviderError {
  readonly scope: QuotaScope;
  readonly retryDelayMs: number | null;
  readonly quotaId: string | null;
  readonly models: string[];
  /** When a daily quota comes back; null for a per-minute one. */
  readonly resetAt: Date | null;

  constructor(details: {
    scope: QuotaScope;
    retryDelayMs: number | null;
    quotaId: string | null;
    models: string[];
    resetAt?: Date | null;
  }) {
    super(
      429,
      `${details.scope === 'day' ? 'The daily' : 'A per-minute'} quota of ${details.models.join(', ') || 'the model'} is spent${details.quotaId ? ` (${details.quotaId})` : ''}.`,
    );
    this.name = 'ProviderLimitError';
    this.scope = details.scope;
    this.retryDelayMs = details.retryDelayMs;
    this.quotaId = details.quotaId;
    this.models = details.models;
    this.resetAt = details.resetAt ?? null;
  }
}

/** A refusal that lasts until the provider's daily reset: nothing is retried before then. */
export const isDailyLimit = (
  cause: unknown,
): cause is ProviderLimitError & { scope: 'day'; resetAt: Date } =>
  cause instanceof ProviderLimitError && cause.scope === 'day' && cause.resetAt !== null;

export const normalizeVector = (vector: number[]) => {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  return norm === 0 ? vector : vector.map((value) => value / norm);
};

export const collectStream = async (
  stream: AsyncGenerator<GenerateChunk, GenerateResult>,
): Promise<GenerateResult & { text: string }> => {
  let text = '';

  while (true) {
    const next = await stream.next();

    if (next.done) {
      return { ...next.value, text };
    }

    text += next.value.text;
  }
};
