import { describe, expect, it } from 'vitest';

import { createGeminiProvider } from './gemini';
import { EMBEDDING_DIMENSIONS } from './types';

const apiKey = process.env.GEMINI_API_KEY;
const live = process.env.GEMINI_LIVE === '1' && Boolean(apiKey);

/**
 * Talks to the real Gemini API. Opt in with GEMINI_LIVE=1 so routine test runs never touch the
 * free-tier quota: `GEMINI_LIVE=1 pnpm --filter web exec vitest run src/lib/ai/gemini.live`.
 */
describe.skipIf(!live)('Gemini provider against the live API', () => {
  const provider = createGeminiProvider({
    apiKey: apiKey ?? '',
    chatModel: process.env.GEMINI_CHAT_MODEL,
    fallbackModels: process.env.GEMINI_CHAT_FALLBACKS?.split(',').map((model) => model.trim()),
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL,
    thinkingLevel: process.env.GEMINI_THINKING_LEVEL,
  });

  it('embeds documents and a query into the same space at the configured size', async () => {
    const [keys, webhooks] = await provider.embed(
      [
        {
          title: 'Authentication',
          text: 'API keys are created in Settings. Rotate a key from the same screen.',
        },
        {
          title: 'Webhooks',
          text: 'Webhooks deliver events as JSON with a signature header you must verify.',
        },
      ],
      'document',
    );
    const [query] = await provider.embed([{ text: 'Where do I create an API key?' }], 'query');

    expect(keys).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(query).toHaveLength(EMBEDDING_DIMENSIONS);

    const dot = (a: number[], b: number[]) =>
      a.reduce((sum, value, index) => sum + value * b[index]!, 0);
    const norm = Math.sqrt(dot(keys!, keys!));

    expect(norm).toBeCloseTo(1, 2);
    expect(dot(query!, keys!)).toBeGreaterThan(dot(query!, webhooks!));
  }, 60_000);

  it('streams an answer that cites the source it was given', async () => {
    const chunks: string[] = [];
    const stream = provider.stream({
      system: [
        'You answer only from the numbered sources supplied with the question.',
        'Cite the sources you used with bracketed numbers such as [1].',
        'If the sources do not contain the answer, reply with exactly NO_ANSWER.',
      ].join('\n'),
      turns: [
        {
          role: 'user',
          text: 'Sources:\n[1] Authentication › API keys\nAPI keys are created in Settings. Rotate a key from the same screen.\n\nQuestion: Where do I create an API key?',
        },
      ],
    });

    let result;

    while (true) {
      const next = await stream.next();

      if (next.done) {
        result = next.value;
        break;
      }

      chunks.push(next.value.text);
    }

    const text = chunks.join('');

    console.info(
      `model=${result.model} prompt=${result.promptTokens} completion=${result.completionTokens} chunks=${chunks.length}\n${text}`,
    );

    expect(chunks.length).toBeGreaterThan(0);
    expect(text).toMatch(/\[1\]/);
    expect(text.toLowerCase()).toContain('settings');
    expect(result.model).toBeTruthy();
  }, 90_000);
});
