import {
  createSource,
  firstIssue,
  parseUploadForm,
  scheduleIngestion,
  SourceError,
  sourceErrorResponse,
  sourceInputSchema,
} from '@/lib/ingest/sources';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
/** Ingestion runs after the response through after(); give it the room a large crawl needs. */
export const maxDuration = 300;

/**
 * Adds a source. JSON for websites, sitemaps and pasted text; multipart form data for uploads.
 * The row is created as the signed-in user and indexing starts once the response has gone out.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getSession();

  if (!user) {
    return Response.json({ error: 'Sign in to add a source.' }, { status: 401 });
  }

  try {
    const contentType = request.headers.get('content-type') ?? '';
    let input;

    if (contentType.includes('multipart/form-data')) {
      input = parseUploadForm(await request.formData());
    } else {
      const body: unknown = await request.json().catch(() => null);
      const parsed = sourceInputSchema.safeParse(body);

      if (!parsed.success) {
        throw new SourceError(400, firstIssue(parsed.error));
      }

      input = parsed.data;
    }

    const source = await createSource({ supabase, user, input });

    scheduleIngestion(source.id);

    return Response.json({ source }, { status: 201 });
  } catch (cause) {
    return sourceErrorResponse(cause);
  }
}
