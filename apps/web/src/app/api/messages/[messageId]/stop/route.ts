import { MAX_STOP_TEXT_LENGTH } from '@parbot/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { rateLimit, settleSavedStop } from '@/lib/engine';
import { getSession } from '@/lib/session';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const idSchema = z.uuid();
const bodySchema = z.object({
  assistantId: z.uuid(),
  conversationId: z.uuid(),
  text: z.string().max(MAX_STOP_TEXT_LENGTH),
});

/** Postgres insufficient_privilege: row level security refused the row. */
const RLS_REFUSED = '42501';
const STOP_LIMIT = { limit: 60, windowMs: 60_000 };

/**
 * The reader pressed Stop on an answer in the in-app chat. The id is the one the client proposed
 * for the answer, so this can arrive before the answer, while it streams or after it was saved.
 * The stop is recorded for the engine to find; an answer already saved is cut back to `text`
 * (what the reader saw) and given back to the month's allowance.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<'/api/messages/[messageId]/stop'>,
) {
  const { messageId } = await context.params;

  if (!idSchema.safeParse(messageId).success) {
    return Response.json({ error: 'That message id is not valid.' }, { status: 400 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'The request body was not JSON.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: 'A stop names the assistant, the conversation and the text that was shown.' },
      { status: 400 },
    );
  }

  const { supabase, user } = await getSession();

  if (!user) {
    return Response.json({ error: 'Sign in to stop an answer.' }, { status: 401 });
  }

  const verdict = rateLimit(`stop:${user.id}`, STOP_LIMIT);

  if (!verdict.allowed) {
    return Response.json(
      { error: 'Too many stops in a short time. Wait a moment and try again.' },
      { status: 429 },
    );
  }

  const { assistantId, conversationId, text } = parsed.data;
  const service = createSupabaseServiceClient();
  // The conversation may not exist yet: the stop can overtake the question it stops. When it
  // does exist it has to be the caller's, in this assistant's in-app chat.
  const { data: conversation } = await service
    .from('conversations')
    .select('assistant_id, owner_id, channel')
    .eq('id', conversationId)
    .maybeSingle();

  if (
    conversation &&
    (conversation.owner_id !== user.id ||
      conversation.assistant_id !== assistantId ||
      conversation.channel !== 'app')
  ) {
    return Response.json({ error: 'That conversation does not exist.' }, { status: 404 });
  }

  // Row level security holds the row to the caller's own assistant. A second stop for the same
  // answer keeps the first.
  const { error } = await supabase.from('message_stops').upsert(
    {
      message_id: messageId,
      conversation_id: conversationId,
      assistant_id: assistantId,
      owner_id: user.id,
      content: text,
    },
    { onConflict: 'message_id', ignoreDuplicates: true },
  );

  if (error?.code === RLS_REFUSED) {
    return Response.json({ error: 'That assistant does not exist.' }, { status: 404 });
  }

  if (error) {
    console.error('[stop] a stop could not be recorded', error);

    return Response.json({ error: 'The stop could not be saved. Try again.' }, { status: 500 });
  }

  const answer = await settleSavedStop(service, { messageId, conversationId, assistantId }, text);

  return Response.json({ stopped: true, answer });
}
