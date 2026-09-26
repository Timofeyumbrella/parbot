import { settleSavedStop } from '@/lib/engine';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  clientIp,
  corsHeaders,
  findAssistantByKey,
  firstIssue,
  jsonError,
  originAllowed,
  preflight,
  readJson,
  requestOrigin,
  selfOrigin,
  takeRateLimits,
  WIDGET_IP_LIMIT,
  WIDGET_VISITOR_LIMIT,
  widgetStopSchema,
} from '@/lib/widget-api';

export const dynamic = 'force-dynamic';

export const OPTIONS = (request: Request) => preflight(request);

/**
 * The visitor abandoned an answer mid-stream (New conversation, or the host page took the widget
 * down). On a serverless host the dropped connection never reaches the function writing the
 * answer, so the widget says so here: the stop is recorded for the engine to find, and an answer
 * already saved is cut back to what the widget had shown and given back to the owner's allowance.
 *
 * The widget sends this as text/plain so the browser needs no preflight for a request that has
 * to survive the page going away.
 */
export async function POST(request: Request) {
  const origin = requestOrigin(request);
  const cors = corsHeaders(origin);
  const parsed = widgetStopSchema.safeParse(await readJson(request));

  if (!parsed.success) {
    return jsonError(400, 'bad_request', firstIssue(parsed.error), cors);
  }

  const { key, visitorId, conversationId, messageId, text } = parsed.data;
  const service = createSupabaseServiceClient();
  const assistant = await findAssistantByKey(service, key);

  if (!assistant) {
    return jsonError(404, 'not_found', 'No assistant has that key.', cors);
  }

  if (!originAllowed(origin, assistant.allowed_origins, selfOrigin(request))) {
    return jsonError(
      403,
      'origin_not_allowed',
      'This site is not allowed to use the assistant.',
      cors,
    );
  }

  const wait = takeRateLimits([
    [`widget:stop:${assistant.id}:${visitorId}`, WIDGET_VISITOR_LIMIT],
    [`widget:stop:ip:${clientIp(request)}`, WIDGET_IP_LIMIT],
  ]);

  if (wait) {
    return jsonError(
      429,
      'rate_limited',
      'Too many requests in a short time. Wait a moment and try again.',
      { ...cors, 'retry-after': wait },
    );
  }

  // The conversation may not exist yet: the stop can overtake the question it stops. When it
  // does exist it has to be this visitor's thread with this assistant.
  const { data: conversation } = await service
    .from('conversations')
    .select('assistant_id, channel, visitor_id')
    .eq('id', conversationId)
    .maybeSingle();

  if (
    conversation &&
    (conversation.assistant_id !== assistant.id ||
      conversation.channel !== 'widget' ||
      conversation.visitor_id !== visitorId)
  ) {
    return jsonError(404, 'not_found', 'That conversation does not exist.', cors);
  }

  const { error } = await service.from('message_stops').upsert(
    {
      message_id: messageId,
      conversation_id: conversationId,
      assistant_id: assistant.id,
      owner_id: assistant.owner_id,
      content: text,
    },
    { onConflict: 'message_id', ignoreDuplicates: true },
  );

  if (error) {
    console.error('[widget] a stop could not be recorded', error);

    return jsonError(500, 'internal', 'The stop could not be saved.', cors);
  }

  await settleSavedStop(service, { messageId, conversationId, assistantId: assistant.id }, text);

  return Response.json({ stopped: true }, { headers: cors });
}
