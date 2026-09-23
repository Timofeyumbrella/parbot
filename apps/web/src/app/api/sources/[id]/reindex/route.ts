import { z } from 'zod';

import { requestReindex, scheduleIngestion, sourceErrorResponse } from '@/lib/ingest/sources';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
/** Ingestion runs after the response through after(); give it the room a large crawl needs. */
export const maxDuration = 300;

/** Queues a source for another run. Pages whose content did not change are kept as they are. */
export async function POST(_request: Request, context: RouteContext<'/api/sources/[id]/reindex'>) {
  const { supabase, user } = await getSession();

  if (!user) {
    return Response.json({ error: 'Sign in to re-index a source.' }, { status: 401 });
  }

  const { id } = await context.params;
  const parsed = z.uuid().safeParse(id);

  if (!parsed.success) {
    return Response.json({ error: 'That source does not exist.' }, { status: 404 });
  }

  try {
    const source = await requestReindex({ supabase, sourceId: parsed.data });

    scheduleIngestion(source.id);

    return Response.json({ source }, { status: 202 });
  } catch (cause) {
    return sourceErrorResponse(cause);
  }
}
