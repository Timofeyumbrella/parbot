import { createGeminiProvider, firstChunkDeadlineFrom, totalFirstChunkBudgetFrom } from './gemini';
import { createStubProvider } from './stub';
import type { AiProvider } from './types';

export * from './types';
export {
  createGeminiProvider,
  DEFAULT_FIRST_CHUNK_DEADLINE_MS,
  DEFAULT_TOTAL_FIRST_CHUNK_BUDGET_MS,
  embeddingText,
  firstChunkDeadlineFrom,
  totalFirstChunkBudgetFrom,
} from './gemini';
export {
  activeDailyLimit,
  type DailyLimitKind,
  type DailyLimitNotice,
  forgetDailyLimits,
  nextDailyReset,
  parseQuotaRefusal,
  type QuotaRefusal,
} from './quota';
export { createStubProvider, stubAnswer, stubEmbedding } from './stub';

const setting = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);

let cached: AiProvider | null = null;

/** True when answers come from a real model rather than the stub. */
export const hasLiveAiProvider = () =>
  setting(process.env.AI_PROVIDER) !== 'stub' && Boolean(setting(process.env.GEMINI_API_KEY));

export const getAiProvider = (): AiProvider => {
  if (cached) {
    return cached;
  }

  const apiKey = setting(process.env.GEMINI_API_KEY);

  cached =
    hasLiveAiProvider() && apiKey
      ? createGeminiProvider({
          apiKey,
          chatModel: setting(process.env.GEMINI_CHAT_MODEL),
          fallbackModels: setting(process.env.GEMINI_CHAT_FALLBACKS)
            ?.split(',')
            .map((model) => model.trim())
            .filter(Boolean),
          embeddingModel: setting(process.env.GEMINI_EMBEDDING_MODEL),
          thinkingLevel: setting(process.env.GEMINI_THINKING_LEVEL),
          firstChunkDeadlineMs: firstChunkDeadlineFrom(process.env.GEMINI_FIRST_CHUNK_DEADLINE_MS),
          totalFirstChunkBudgetMs: totalFirstChunkBudgetFrom(
            process.env.GEMINI_FIRST_CHUNK_TOTAL_MS,
          ),
        })
      : createStubProvider();

  return cached;
};

/** Test hook. */
export const resetAiProvider = () => {
  cached = null;
};
