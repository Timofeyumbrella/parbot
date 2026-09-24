import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ value: z.union([z.literal(1), z.literal(-1), z.null()]) });
const idSchema = z.uuid();

/** Thumbs up, thumbs down or cleared. Row level security and the column grant scope the write. */
export async function POST(request: NextRequest, context: RouteContext<'/api/messages/[messageId]/feedback'>) {
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
    return Response.json({ error: 'Feedback must be 1, -1 or null.' }, { status: 400 });
  }

  const { supabase, user } = await getSession();

  if (!user) {
    return Response.json({ error: 'Sign in to rate an answer.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('messages')
    .update({ feedback: parsed.data.value })
    .eq('id', messageId)
    .eq('role', 'assistant')
    .select('id, feedback');

  if (error) {
    return Response.json({ error: 'The feedback could not be saved. Try again.' }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return Response.json({ error: 'That message does not exist.' }, { status: 404 });
  }

  return Response.json({ id: data[0]!.id, feedback: data[0]!.feedback });
}
