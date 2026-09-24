import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  corsHeaders,
  findAssistantByKey,
  jsonError,
  loadOwnerPlan,
  originAllowed,
  preflight,
  requestOrigin,
  widgetConfigFor,
} from '@/lib/widget-api';

export const dynamic = 'force-dynamic';

export const OPTIONS = (request: Request) => preflight(request);

/**
 * What an installed widget needs to draw itself. Public by design: nothing here is secret, and
 * gated settings are folded back to their free-plan values before they leave the server.
 */
export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const cors = corsHeaders(origin);
  const key = new URL(request.url).searchParams.get('key')?.trim() ?? '';

  if (!key) {
    return jsonError(400, 'bad_request', 'Pass the assistant public key as ?key=.', cors);
  }

  const service = createSupabaseServiceClient();
  const assistant = await findAssistantByKey(service, key);

  if (!assistant) {
    return jsonError(404, 'not_found', 'No assistant has that key.', cors);
  }

  if (!originAllowed(origin, assistant.allowed_origins)) {
    return jsonError(403, 'origin_not_allowed', 'This site is not allowed to use the assistant.', cors);
  }

  const plan = await loadOwnerPlan(service, assistant.owner_id);

  return Response.json(widgetConfigFor(assistant, plan), {
    headers: { ...cors, 'cache-control': 'public, max-age=60' },
  });
}
