import { type ChatStreamEvent, type Citation, citedIndexes, MAX_MESSAGE_LENGTH } from '@parbot/shared';

import { type AiProvider, type ChatTurn, ModelBusyError } from '@/lib/ai';
import { checkCapacity, usagePeriodStart } from '@/lib/plans';

import { buildSystemPrompt, conversationTitle, isRefusal, NO_ANSWER, renderQuestion, UNANSWERED_TEXT } from './prompt';
import { retrievalQuery, retrieveChunks, type RetrievedChunk, type ServiceClient } from './retrieval';

export type AnswerAssistant = {
  id: string;
  owner_id: string;
  name: string;
  instructions: string | null;
};

export type AnswerConversation = {
  id: string;
  channel: 'app' | 'widget';
  visitorId?: string | null;
  pageUrl?: string | null;
};

export type AnswerParams = {
  service: ServiceClient;
  provider: AiProvider;
  assistant: AnswerAssistant;
  conversation: AnswerConversation;
  message: string;
  signal?: AbortSignal;
};

const HISTORY_TURNS = 6;
const SNIPPET_CHARS = 240;
/** Tokens are held back until this many characters arrived, so a NO_ANSWER never leaks. */
const HOLD_CHARS = NO_ANSWER.length + 2;

const snippet = (content: string) => {
  const text = content.replace(/\s+/g, ' ').trim();

  if (text.length <= SNIPPET_CHARS) {
    return text;
  }

  const cut = text.slice(0, SNIPPET_CHARS);
  const lastSpace = cut.lastIndexOf(' ');

  return `${cut.slice(0, lastSpace > SNIPPET_CHARS - 40 ? lastSpace : cut.length).trimEnd()}…`;
};

const toCitations = (answer: string, chunks: RetrievedChunk[]): Citation[] =>
  citedIndexes(answer, chunks.length).flatMap((index) => {
    const chunk = chunks[index - 1];

    return chunk
      ? [
          {
            index,
            documentId: chunk.documentId,
            title: chunk.documentTitle,
            url: chunk.documentUrl,
            snippet: snippet(chunk.content),
          },
        ]
      : [];
  });

const loadPlan = async (service: ServiceClient, ownerId: string) => {
  const { data } = await service
    .from('subscriptions')
    .select('plan_id, status')
    .eq('account_id', ownerId)
    .maybeSingle();

  return data?.status === 'canceled' ? 'hobby' : (data?.plan_id ?? 'hobby');
};

const loadUsage = async (service: ServiceClient, ownerId: string) => {
  const { data } = await service
    .from('usage_counters')
    .select('value')
    .eq('owner_id', ownerId)
    .eq('metric', 'messages')
    .eq('period_start', usagePeriodStart())
    .maybeSingle();

  return Number(data?.value ?? 0);
};

/**
 * Answers one message and persists both sides of the exchange. Yields protocol events in order:
 * meta, token*, citations, done. Errors are yielded as an event, never thrown, so the transport
 * can always finish the stream cleanly.
 */
export async function* streamAnswer(params: AnswerParams): AsyncGenerator<ChatStreamEvent> {
  const { service, provider, assistant, conversation, signal } = params;
  const startedAt = Date.now();
  const message = params.message.trim();

  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    yield { type: 'error', code: 'bad_request', message: 'Ask something between 1 and 2000 characters.' };

    return;
  }

  const [planId, used] = await Promise.all([
    loadPlan(service, assistant.owner_id),
    loadUsage(service, assistant.owner_id),
  ]);
  const quota = checkCapacity(planId, used, 'messagesPerMonth');

  if (!quota.allowed) {
    yield {
      type: 'error',
      code: 'quota_exceeded',
      message: `This account has used its ${quota.limit.toLocaleString('en-US')} answers for the month.`,
    };

    return;
  }

  const { data: existing } = await service
    .from('conversations')
    .select('id, assistant_id, channel, visitor_id, title')
    .eq('id', conversation.id)
    .maybeSingle();

  if (existing) {
    const foreign =
      existing.assistant_id !== assistant.id ||
      existing.channel !== conversation.channel ||
      (conversation.channel === 'widget' && existing.visitor_id !== conversation.visitorId);

    if (foreign) {
      yield { type: 'error', code: 'not_found', message: 'That conversation does not exist.' };

      return;
    }

    if (!existing.title) {
      await service
        .from('conversations')
        .update({ title: conversationTitle(message) })
        .eq('id', conversation.id);
    }
  } else {
    const { error } = await service.from('conversations').insert({
      id: conversation.id,
      assistant_id: assistant.id,
      owner_id: assistant.owner_id,
      channel: conversation.channel,
      visitor_id: conversation.visitorId ?? null,
      page_url: conversation.pageUrl ?? null,
      title: conversationTitle(message),
    });

    if (error) {
      yield { type: 'error', code: 'internal', message: 'The conversation could not be started.' };

      return;
    }
  }

  const { data: history } = await service
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: false })
    .limit(HISTORY_TURNS);

  const priorTurns: ChatTurn[] = (history ?? [])
    .reverse()
    .map((row) => ({ role: row.role === 'user' ? 'user' : 'model', text: row.content }));
  const previousQuestion = [...(history ?? [])].find((row) => row.role === 'user')?.content ?? null;

  const { data: userMessage, error: userError } = await service
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      assistant_id: assistant.id,
      owner_id: assistant.owner_id,
      role: 'user',
      content: message,
    })
    .select('id')
    .single();

  if (userError || !userMessage) {
    yield { type: 'error', code: 'internal', message: 'The message could not be saved.' };

    return;
  }

  const assistantMessageId = crypto.randomUUID();

  yield {
    type: 'meta',
    conversationId: conversation.id,
    userMessageId: userMessage.id,
    assistantMessageId,
  };

  const rollback = async () => {
    await service.from('messages').delete().eq('id', userMessage.id);
  };

  let chunks: RetrievedChunk[] = [];

  try {
    chunks = await retrieveChunks(
      service,
      provider,
      assistant.id,
      retrievalQuery(message, previousQuestion),
    );
  } catch (cause) {
    await rollback();
    yield providerError(cause);

    return;
  }

  let text = '';
  let model: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let refused = chunks.length === 0;

  if (!refused) {
    const turns: ChatTurn[] = [...priorTurns, { role: 'user', text: renderQuestion(message, chunks) }];
    const generator = provider.stream({
      system: buildSystemPrompt(assistant),
      turns,
      signal,
    });

    let held = '';
    let releasing = false;

    try {
      while (true) {
        const next = await generator.next();

        if (next.done) {
          model = next.value.model;
          promptTokens = next.value.promptTokens;
          completionTokens = next.value.completionTokens;
          break;
        }

        if (releasing) {
          text += next.value.text;
          yield { type: 'token', text: next.value.text };
          continue;
        }

        held += next.value.text;

        if (held.trim().length >= HOLD_CHARS) {
          if (isRefusal(held)) {
            refused = true;
            break;
          }

          releasing = true;
          text = held;
          yield { type: 'token', text: held };
        }
      }

      if (!releasing && !refused) {
        if (isRefusal(held) || held.trim().length === 0) {
          refused = true;
        } else {
          text = held;
          yield { type: 'token', text: held };
        }
      }
    } catch (cause) {
      if (signal?.aborted) {
        await rollback();

        return;
      }

      if (!text) {
        await rollback();
        yield providerError(cause);

        return;
      }

      // The model stopped after part of an answer. Keep what arrived rather than lose it.
      model ??= null;
    }
  }

  const answered = !refused;
  const content = answered ? text.trim() : UNANSWERED_TEXT;
  const citations = answered ? toCitations(content, chunks) : [];

  if (!answered) {
    yield { type: 'token', text: content };
  }

  const latencyMs = Date.now() - startedAt;

  const { error: assistantError } = await service.from('messages').insert({
    id: assistantMessageId,
    conversation_id: conversation.id,
    assistant_id: assistant.id,
    owner_id: assistant.owner_id,
    role: 'assistant',
    content,
    citations,
    answered,
    model,
    latency_ms: latencyMs,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
  });

  if (assistantError) {
    yield { type: 'error', code: 'internal', message: 'The answer could not be saved.' };

    return;
  }

  await service.rpc('increment_usage', { owner: assistant.owner_id, usage: 'messages', delta: 1 });

  yield { type: 'citations', citations };
  yield { type: 'done', answered, latencyMs };
}

const providerError = (cause: unknown): ChatStreamEvent =>
  cause instanceof ModelBusyError
    ? { type: 'error', code: 'model_busy', message: cause.message }
    : {
        type: 'error',
        code: 'internal',
        message: cause instanceof Error ? cause.message : 'The assistant could not answer.',
      };
