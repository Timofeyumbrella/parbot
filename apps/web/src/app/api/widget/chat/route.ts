import { getAiProvider } from '@/lib/ai';
import { streamAnswer, streamResponse } from '@/lib/engine';
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
  WIDGET_ASSISTANT_LIMIT,
  WIDGET_IP_LIMIT,
  WIDGET_OWNER_LIMIT,
  WIDGET_VISITOR_LIMIT,
  widgetChatSchema,
} from '@/lib/widget-api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const OPTIONS = (request: Request) => preflight(request);

/**
 * One widget question, answered as a stream of protocol events. Everything that can be refused
 * is refused as JSON before the stream starts, so the widget tells the two apart by content type.
 */
export async function POST(request: Request) {
  const origin = requestOrigin(request);
  const cors = corsHeaders(origin);
  const parsed = widgetChatSchema.safeParse(await readJson(request));

  if (!parsed.success) {
    return jsonError(400, 'bad_request', firstIssue(parsed.error), cors);
  }

  const { key, visitorId, conversationId, message, pageUrl } = parsed.data;
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
    [`widget:visitor:${assistant.id}:${visitorId}`, WIDGET_VISITOR_LIMIT],
    [`widget:ip:${clientIp(request)}`, WIDGET_IP_LIMIT],
    [`widget:assistant:${assistant.id}`, WIDGET_ASSISTANT_LIMIT],
    [`widget:owner:${assistant.owner_id}`, WIDGET_OWNER_LIMIT],
  ]);

  if (wait) {
    return jsonError(
      429,
      'rate_limited',
      'Too many messages in a short time. Wait a moment and try again.',
      {
        ...cors,
        'retry-after': wait,
      },
    );
  }

  return streamResponse(
    streamAnswer({
      service,
      provider: getAiProvider(),
      assistant,
      conversation: { id: conversationId, channel: 'widget', visitorId, pageUrl },
      message,
      signal: request.signal,
    }),
    { headers: cors },
  );
}
