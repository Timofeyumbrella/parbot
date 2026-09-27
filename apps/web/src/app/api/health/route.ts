import { MAX_MESSAGE_LENGTH } from '@parbot/shared';

import { activeDailyLimit, hasLiveAiProvider } from '@/lib/ai';
import { serverEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Liveness plus the switches that decide what a deployment can do. `aiLimited` is "daily" while
 * the AI provider's daily limit holds indexing or answers back: the last time this instance ran
 * into it (`aiLimitedAt`) and when it resets (`aiResumesAt`). It is read from memory, never by
 * asking the provider, so an instance that has not run into the limit yet reports null.
 */
export const GET = () => {
  const live = hasLiveAiProvider();
  const limit = live ? activeDailyLimit() : null;

  return Response.json({
    ok: true,
    ai: live ? 'gemini' : 'stub',
    aiLimited: limit ? 'daily' : null,
    aiLimitedAt: limit?.seenAt.toISOString() ?? null,
    aiResumesAt: limit?.resetAt.toISOString() ?? null,
    billing: serverEnv().billingProvider,
    maxMessageLength: MAX_MESSAGE_LENGTH,
  });
};
