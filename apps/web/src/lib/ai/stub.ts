import {
  type AiProvider,
  collectStream,
  EMBEDDING_DIMENSIONS,
  type EmbedInput,
  type GenerateChunk,
  type GenerateInput,
  type GenerateResult,
  normalizeVector,
} from './types';

const STUB_MODEL = 'stub-1';

const hash = (token: string) => {
  let value = 2166136261;

  for (let index = 0; index < token.length; index += 1) {
    value ^= token.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }

  return value >>> 0;
};

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9а-яё]+/i)
    .filter((token) => token.length > 1);

/** Bag-of-words hashed into the embedding space: similar wording gives similar vectors. */
export const stubEmbedding = (text: string) => {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);

  for (const token of tokenize(text)) {
    const bucket = hash(token) % EMBEDDING_DIMENSIONS;
    vector[bucket] += 1;
    vector[hash(`${token}#2`) % EMBEDDING_DIMENSIONS] += 0.5;
  }

  return normalizeVector(vector);
};

const firstSentence = (text: string) => {
  const line = text.replace(/\s+/g, ' ').trim();
  const end = line.search(/[.!?](\s|$)/);

  return end === -1 ? line.slice(0, 160) : line.slice(0, end + 1);
};

/**
 * Answers the way the real model is asked to: with a citation when sources were supplied and the
 * NO_ANSWER marker when they were not. Keeps the app usable without an API key.
 */
export const stubAnswer = (prompt: string) => {
  const sources = [...prompt.matchAll(/^\[(\d+)\]\s+(.+)\n([\s\S]*?)(?=^\[\d+\]\s|\n\nQuestion:)/gm)];

  if (sources.length === 0) {
    return 'NO_ANSWER';
  }

  const [, index, , body] = sources[0]!;
  // The rendered source starts with a URL line; the answer should read like prose.
  const prose = (body ?? '')
    .split('\n')
    .filter((line) => !line.startsWith('URL:'))
    .join('\n');

  return `${firstSentence(prose)} [${index}]`;
};

export const createStubProvider = (): AiProvider => {
  const stream = async function* (input: GenerateInput): AsyncGenerator<GenerateChunk, GenerateResult> {
    const last = input.turns.at(-1)?.text ?? '';
    const answer = stubAnswer(last);
    const words = answer.split(' ');

    for (let index = 0; index < words.length; index += 1) {
      if (input.signal?.aborted) {
        // Match the real provider: a stopped stream is an error, so the engine rolls back.
        throw new DOMException('The answer was stopped.', 'AbortError');
      }

      yield { text: index === 0 ? words[index]! : ` ${words[index]}` };
      await new Promise((resolve) => setTimeout(resolve, 12));
    }

    return {
      model: STUB_MODEL,
      promptTokens: Math.ceil(last.length / 4),
      completionTokens: Math.ceil(answer.length / 4),
    };
  };

  return {
    name: 'stub',
    embed: (inputs: EmbedInput[]) =>
      Promise.resolve(inputs.map((input) => stubEmbedding(input.text))),
    stream,
    generate: (input) => collectStream(stream(input)),
  };
};
