import { MAX_MESSAGE_LENGTH } from '@parbot/shared';

import { hasLiveAiProvider } from '@/lib/ai';
import { serverEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Liveness plus the two switches that decide what a deployment can do. */
export const GET = () =>
  Response.json({
    ok: true,
    ai: hasLiveAiProvider() ? 'gemini' : 'stub',
    billing: serverEnv().billingProvider,
    maxMessageLength: MAX_MESSAGE_LENGTH,
  });
