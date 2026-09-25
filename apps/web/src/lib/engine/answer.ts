import {
  type ChatStreamEvent,
  type Citation,
  citedIndexes,
  MAX_MESSAGE_LENGTH,
} from '@parbot/shared';

import { type AiProvider, type ChatTurn, ModelBusyError } from '@/lib/ai';
import { entitledPlanId } from '@/lib/billing/entitlement';
import { planFor } from '@/lib/plans';

import {
  buildSystemPrompt,
  conversationTitle,
  isRefusal,
  NO_ANSWER,
  renderQuestion,
  UNANSWERED_TEXT,
} from './prompt';
import {
  retrievalQuery,
  retrieveChunks,
  type RetrievedChunk,
  type ServiceClient,
} from './retrieval';

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
/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';

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

  return entitledPlanId(data);
};

type StoredConversation = {
  assistant_id: string;
  channel: string;
  visitor_id: string | null;
  title: string | null;
};

const findConversation = async (
  service: ServiceClient,
  id: string,
): Promise<StoredConversation | null> => {
  const { data } = await service
    .from('conversations')
    .select('id, assistant_id, channel, visitor_id, title')
    .eq('id', id)
    .maybeSingle();

  return data;
};

/** Another assistant's, channel's or visitor's conversation is reported as missing. */
const isForeign = (
  stored: StoredConversation,
  assistant: AnswerAssistant,
  conversation: AnswerConversation,
) =>
  stored.assistant_id !== assistant.id ||
  stored.channel !== conversation.channel ||
  (conversation.channel === 'widget' && stored.visitor_id !== conversation.visitorId);

/**
 * The stored history as model turns, oldest first, from rows that arrive newest first. A question
 * the reader stopped before any text arrived has no answer after it, and a window can start on an
 * answer; both are left out so the turns alternate the way the model expects.
 */
export const historyTurns = (newestFirst: { role: string; content: string }[]): ChatTurn[] => {
  const rows = [...newestFirst].reverse().filter((row) => row.content.trim().length > 0);
  const turns: ChatTurn[] = [];

  rows.forEach((row, index) => {
    if (row.role === 'user') {
      if (rows[index + 1]?.role === 'assistant') {
        turns.push({ role: 'user', text: row.content });
      }
    } else if (turns.at(-1)?.role === 'user') {
      turns.push({ role: 'model', text: row.content });
    }
  });

  return turns;
};

/**
 * Answers one message and persists both sides of the exchange. Yields protocol events in order:
 * meta, token*, citations, done. Errors are yielded as an event, never thrown, so the transport
 * can always finish the stream cleanly.
 *
 * What is stored matches what the reader saw:
 * - an answer is saved and metered;
 * - a failure before any text removes the reader's message (the delete trigger moves the
 *   conversation's counters back) and, when this request created the conversation, the
 *   conversation too, so nothing is left that the reader never saw answered;
 * - a stop (the reader pressed Stop or went away) keeps the reader's message and the text that had
 *   arrived, as an assistant message with `answered` null, and is not metered.
 */
export async function* streamAnswer(params: AnswerParams): AsyncGenerator<ChatStreamEvent> {
  const { service, provider, assistant, conversation, signal } = params;
  const startedAt = Date.now();
  const message = params.message.trim();

  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    yield {
      type: 'error',
      code: 'bad_request',
      message: 'Ask something between 1 and 2000 characters.',
    };

    return;
  }

  const existing = await findConversation(service, conversation.id);

  if (existing && isForeign(existing, assistant, conversation)) {
    yield { type: 'error', code: 'not_found', message: 'That conversation does not exist.' };

    return;
  }

  // Checking the limit and taking the slot is one statement, so answers in flight together cannot
  // all pass at one below the limit. The slot is given back unless an answer is saved.
  const limit = planFor(await loadPlan(service, assistant.owner_id)).messagesPerMonth;
  const { data: reserved, error: reserveError } = await service.rpc('reserve_message', {
    owner: assistant.owner_id,
    max_allowed: limit,
  });

  if (reserveError) {
    yield providerError(reserveError);

    return;
  }

  if (!reserved) {
    yield {
      type: 'error',
      code: 'quota_exceeded',
      message: `This account has used its ${limit.toLocaleString('en-US')} answers for the month.`,
    };

    return;
  }

  const assistantMessageId = crypto.randomUUID();
  let created = false;
  let userMessageId: string | null = null;
  let chunks: RetrievedChunk[] = [];
  let model: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  /** The text the reader has been sent so far. */
  let shown = '';
  /** Saved or rolled back. Leaving the generator any other way means the reader stopped. */
  let settled = false;
  let metered = false;

  const rollback = async () => {
    settled = true;

    if (userMessageId) {
      await service.from('messages').delete().eq('id', userMessageId);
    }

    if (created) {
      // Only while empty: a second request for the same new id may have written to it meanwhile.
      await service.from('conversations').delete().eq('id', conversation.id).eq('message_count', 0);
    }
  };

  const keepPartial = async () => {
    settled = true;
    const content = shown.trim();

    if (!userMessageId || !content) {
      return;
    }

    const { error } = await service.from('messages').insert({
      id: assistantMessageId,
      conversation_id: conversation.id,
      assistant_id: assistant.id,
      owner_id: assistant.owner_id,
      role: 'assistant',
      content,
      citations: toCitations(content, chunks),
      answered: null,
      model,
      latency_ms: Date.now() - startedAt,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
    });

    if (error) {
      console.error('[engine] a stopped answer could not be saved', error);
    }
  };

  try {
    if (!existing) {
      const { error } = await service.from('conversations').insert({
        id: conversation.id,
        assistant_id: assistant.id,
        owner_id: assistant.owner_id,
        channel: conversation.channel,
        visitor_id: conversation.visitorId ?? null,
        page_url: conversation.pageUrl ?? null,
        title: conversationTitle(message),
      });

      if (error?.code === UNIQUE_VIOLATION) {
        // Another request for the same new id (a retry, a second tab) created it first.
        const winner = await findConversation(service, conversation.id);

        if (!winner || isForeign(winner, assistant, conversation)) {
          settled = true;
          yield { type: 'error', code: 'not_found', message: 'That conversation does not exist.' };

          return;
        }
      } else if (error) {
        console.error('[engine] a conversation could not be started', error);
        settled = true;
        yield {
          type: 'error',
          code: 'internal',
          message: 'The conversation could not be started.',
        };

        return;
      } else {
        created = true;
      }
    } else if (!existing.title) {
      await service
        .from('conversations')
        .update({ title: conversationTitle(message) })
        .eq('id', conversation.id);
    }

    const { data: history } = await service
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_TURNS);

    // Newest first, so the first user row is the latest question.
    const newestFirst = history ?? [];
    const priorTurns = historyTurns(newestFirst);
    const previousQuestion = newestFirst.find((row) => row.role === 'user')?.content ?? null;

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
      console.error('[engine] a message could not be saved', userError);
      await rollback();
      yield { type: 'error', code: 'internal', message: 'The message could not be saved.' };

      return;
    }

    userMessageId = userMessage.id;

    yield {
      type: 'meta',
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      assistantMessageId,
    };

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
    let refused = chunks.length === 0;

    if (!refused) {
      const turns: ChatTurn[] = [
        ...priorTurns,
        { role: 'user', text: renderQuestion(message, chunks) },
      ];
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
            shown = text;
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
            shown = text;
            yield { type: 'token', text: held };
          }
        }

        if (!releasing && !refused) {
          if (isRefusal(held) || held.trim().length === 0) {
            refused = true;
          } else {
            text = held;
            shown = text;
            yield { type: 'token', text: held };
          }
        }
      } catch (cause) {
        if (signal?.aborted) {
          // A stop: the finally below keeps the question and what arrived.
          return;
        }

        if (!text) {
          await rollback();
          yield providerError(cause);

          return;
        }

        // The model stopped after part of an answer. Keep what arrived rather than lose it.
        console.error('[engine] an answer was cut short', cause);
      }
    }

    const answered = !refused;
    const content = answered ? text.trim() : UNANSWERED_TEXT;
    const citations = answered ? toCitations(content, chunks) : [];

    if (!answered) {
      shown = content;
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
      console.error('[engine] an answer could not be saved', assistantError);
      await rollback();
      yield { type: 'error', code: 'internal', message: 'The answer could not be saved.' };

      return;
    }

    settled = true;
    metered = true;

    yield { type: 'citations', citations };
    yield { type: 'done', answered, latencyMs };
  } finally {
    // Also runs when the transport stops pulling events because the reader went away.
    if (!settled) {
      await keepPartial();
    }

    if (!metered) {
      await service.rpc('release_message', { owner: assistant.owner_id });
    }
  }
}

/** The sentences a reader sees when the model or the database fails. Never the library's text. */
export const ANSWER_ERROR_COPY = {
  model_busy: 'The assistant is busy right now. Wait a moment and try again.',
  internal: 'The answer could not be produced. Try again in a moment.',
} as const;

/** Provider and driver messages name models, tables and hosts, so they go to the log, not the wire. */
const providerError = (cause: unknown): ChatStreamEvent => {
  if (cause instanceof ModelBusyError) {
    return { type: 'error', code: 'model_busy', message: ANSWER_ERROR_COPY.model_busy };
  }

  console.error('[engine] answer failed', cause);

  return { type: 'error', code: 'internal', message: ANSWER_ERROR_COPY.internal };
};
