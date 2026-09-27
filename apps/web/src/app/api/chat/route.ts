import { type ChatStreamEvent, MAX_MESSAGE_LENGTH, MAX_REFERENCES } from '@parbot/shared';
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
  assistantMessageId: z.uuid().optional(),
  // Checked again in the engine against the assistant's own sources; anything else is left out.
  references: z.array(z.uuid()).max(MAX_REFERENCES).optional(),
  // Checked below against the caller's own projects on this assistant.
  projectId: z.uuid().optional(),
});

/** Says which part of the request was wrong, so a broken link reads differently from a long message. */
const validationMessage = (error: z.ZodError) => {
  const fields = new Set(error.issues.map((issue) => String(issue.path[0] ?? '')));

  if (fields.has('assistantId')) {
    return 'That assistant link is not valid. Open the assistant from the dashboard and try again.';
  }

  if (fields.has('conversationId') || fields.has('assistantMessageId')) {
    return 'That conversation link is not valid. Start a new chat.';
  }

  if (fields.has('projectId')) {
    return 'That project link is not valid. Open the project from the chat sidebar and try again.';
  }

  if (fields.has('references')) {
    return `Reference up to ${MAX_REFERENCES} files or sources, picked from the list, and send again.`;
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

  const { assistantId, projectId } = parsed.data;

  // The limit is the account's own, so it is charged alongside the lookup rather than after it:
  // one round trip less before the answer starts, at the cost of counting a request for a missing
  // assistant against the account that sent it. A project is looked up in the same breath, with
  // the caller's session, so only their own project on this assistant passes.
  const service = createSupabaseServiceClient();
  const [{ data: assistant }, verdict, project] = await Promise.all([
    supabase
      .from('assistants')
      .select('id, owner_id, name, instructions')
      .eq('id', assistantId)
      .maybeSingle(),
    chargeRateLimits(service, [[`chat:${user.id}`, CHAT_LIMIT]]),
    projectId
      ? supabase
          .from('chat_projects')
          .select('id')
          .eq('id', projectId)
          .eq('assistant_id', assistantId)
          .maybeSingle()
      : null,
  ]);

  if (!assistant) {
    return fail(404, {
      type: 'error',
      code: 'not_found',
      message: 'That assistant does not exist.',
    });
  }

  if (project?.error) {
    return fail(500, {
      type: 'error',
      code: 'internal',
      message: 'The project could not be read. Try again in a moment.',
    });
  }

  if (project && !project.data) {
    return fail(404, {
      type: 'error',
      code: 'not_found',
      message: 'That project no longer exists. Start the chat outside it, or pick another project.',
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
      assistantMessageId: parsed.data.assistantMessageId,
      references: parsed.data.references,
      projectId,
      signal: request.signal,
    }),
  );
}
