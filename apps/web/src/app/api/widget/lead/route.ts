import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  clientIp,
  corsHeaders,
  findAssistantByKey,
  firstIssue,
  jsonError,
  loadOwnerPlan,
  originAllowed,
  preflight,
  readJson,
  requestOrigin,
  selfOrigin,
  takeRateLimits,
  WIDGET_LEAD_ASSISTANT_LIMIT,
  WIDGET_LEAD_IP_LIMIT,
  WIDGET_LEAD_LIMIT,
  widgetLeadSchema,
} from '@/lib/widget-api';

export const dynamic = 'force-dynamic';

export const OPTIONS = (request: Request) => preflight(request);

/** A visitor leaves their email after an answer the docs could not give. */
export async function POST(request: Request) {
  const origin = requestOrigin(request);
  const cors = corsHeaders(origin);
  const parsed = widgetLeadSchema.safeParse(await readJson(request));

  if (!parsed.success) {
    return jsonError(400, 'bad_request', firstIssue(parsed.error), cors);
  }

  const { key, visitorId, conversationId, email, note, pageUrl } = parsed.data;
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

  const plan = await loadOwnerPlan(service, assistant.owner_id);

  if (!plan.leadCapture || !assistant.lead_capture) {
    return jsonError(403, 'unauthorized', 'This assistant does not collect email addresses.', cors);
  }

  // The visitor id is the client's to invent, so the address and the assistant are capped too;
  // otherwise anyone with the public key could fill the owner's inbox with leads.
  const wait = await takeRateLimits(service, [
    [`widget:lead:${assistant.id}:${visitorId}`, WIDGET_LEAD_LIMIT],
    [`widget:lead:ip:${clientIp(request)}`, WIDGET_LEAD_IP_LIMIT],
    [`widget:lead:assistant:${assistant.id}`, WIDGET_LEAD_ASSISTANT_LIMIT],
  ]);

  if (wait) {
    return jsonError(
      429,
      'rate_limited',
      'Too many requests in a short time. Wait a moment and try again.',
      {
        ...cors,
        'retry-after': wait,
      },
    );
  }

  // A conversation is only linked when it really is this visitor's thread with this assistant;
  // anything else would let a lead be pinned onto a stranger's conversation.
  if (conversationId) {
    const { data: conversation } = await service
      .from('conversations')
      .select('id, assistant_id, visitor_id')
      .eq('id', conversationId)
      .maybeSingle();

    if (
      !conversation ||
      conversation.assistant_id !== assistant.id ||
      conversation.visitor_id !== visitorId
    ) {
      return jsonError(404, 'not_found', 'That conversation does not exist.', cors);
    }
  }

  const { error } = await service.from('leads').insert({
    assistant_id: assistant.id,
    owner_id: assistant.owner_id,
    conversation_id: conversationId ?? null,
    email: email.toLowerCase(),
    note: note || null,
    page_url: pageUrl ?? null,
  });

  if (error) {
    return jsonError(500, 'internal', 'The message could not be saved. Try again.', cors);
  }

  return Response.json({ ok: true }, { status: 201, headers: cors });
}
