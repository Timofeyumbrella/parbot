import { type ChatStreamEvent, MAX_MESSAGE_LENGTH } from '@parbot/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { getAiProvider } from '@/lib/ai';
import { chargeRateLimits, errorStream, streamAnswer, streamResponse } from '@/lib/engine';
import { getSession } from '@/lib/session';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** A sliding minute per account, counted in the database so every server instance shares it. */
const CHAT_LIMIT = { limit: 30, windowMs: 60_000 };

const requestSchema = z.object({
  assistantId: z.uuid(),
  conversationId: z.uuid(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

/** Says which part of the request was wrong, so a broken link reads differently from a long message. */
const validationMessage = (error: z.ZodError) => {
  const fields = new Set(error.issues.map((issue) => String(issue.path[0] ?? '')));

  if (fields.has('assistantId')) {
    return 'That assistant link is not valid. Open the assistant from the dashboard and try again.';
  }

  if (fields.has('conversationId')) {
    return 'That conversation link is not valid. Start a new chat.';
  }

  return `Ask something between 1 and ${MAX_MESSAGE_LENGTH.toLocaleString('en-US')} characters.`;
};

/** Early failures still arrive as a stream, so the client has one code path. */
const fail = (status: number, event: ChatStreamEvent) =>
  streamResponse(errorStream(event), { status });

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return fail(400, {
      type: 'error',
      code: 'bad_request',
      message: 'The request body was not JSON.',
    });
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return fail(400, {
      type: 'error',
      code: 'bad_request',
      message: validationMessage(parsed.error),
    });
  }

  const { supabase, user } = await getSession();

  if (!user) {
    return fail(401, {
      type: 'error',
      code: 'unauthorized',
      message: 'Sign in to chat with your assistant.',
    });
  }

  // The limit is the account's own, so it is charged alongside the lookup rather than after it:
  // one round trip less before the answer starts, at the cost of counting a request for a missing
  // assistant against the account that sent it.
  const service = createSupabaseServiceClient();
  const [{ data: assistant }, verdict] = await Promise.all([
    supabase
      .from('assistants')
      .select('id, owner_id, name, instructions')
      .eq('id', parsed.data.assistantId)
      .maybeSingle(),
    chargeRateLimits(service, [[`chat:${user.id}`, CHAT_LIMIT]]),
  ]);

  if (!assistant) {
    return fail(404, {
      type: 'error',
      code: 'not_found',
      message: 'That assistant does not exist.',
    });
  }

  if (!verdict.allowed) {
    const seconds = Math.max(Math.ceil(verdict.retryAfterMs / 1000), 1);

    return fail(429, {
      type: 'error',
      code: 'rate_limited',
      message: `You are sending messages quickly. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`,
    });
  }

  return streamResponse(
    streamAnswer({
      service,
      provider: getAiProvider(),
      assistant,
      conversation: { id: parsed.data.conversationId, channel: 'app' },
      message: parsed.data.message,
      signal: request.signal,
    }),
  );
}
