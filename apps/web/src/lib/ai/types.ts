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

export interface AiProvider {
  readonly name: 'gemini' | 'stub';
  /** One vector per input, `EMBEDDING_DIMENSIONS` long and unit length. */
  embed(inputs: EmbedInput[], kind: EmbeddingKind): Promise<number[][]>;
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
