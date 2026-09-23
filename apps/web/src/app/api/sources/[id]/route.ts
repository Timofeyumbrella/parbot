import { z } from 'zod';

import { deleteSource, sourceErrorResponse } from '@/lib/ingest/sources';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Removes a source, its documents and chunks (by cascade) and, last, its stored file. */
export async function DELETE(_request: Request, context: RouteContext<'/api/sources/[id]'>) {
  const { supabase, user } = await getSession();

  if (!user) {
    return Response.json({ error: 'Sign in to remove a source.' }, { status: 401 });
  }

  const { id } = await context.params;
  const parsed = z.uuid().safeParse(id);

  if (!parsed.success) {
    return Response.json({ error: 'That source does not exist.' }, { status: 404 });
  }

  try {
    await deleteSource({ supabase, sourceId: parsed.data });

    return Response.json({ ok: true });
  } catch (cause) {
    return sourceErrorResponse(cause);
  }
}
