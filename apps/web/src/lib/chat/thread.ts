import type { ChatErrorCode, ChatStreamEvent, Citation } from '@parbot/shared';

import type { Json } from '@/lib/db/types';

/**
 * The thread cache is the single source of truth for what the chat renders. Every transition is a
 * pure function over it, so the same code runs for a stream that is being consumed, a remount in
 * the middle of one, and the unit tests.
 */

export type MessageStatus =
  /** Persisted and finished. */
  | 'complete'
  /** A user message the server has not confirmed yet. */
  | 'pending'
  /** An assistant placeholder that is still receiving tokens. */
  | 'streaming'
  /** The assistant stopped at the reader's request; the text is partial. */
  | 'stopped'
  /** A user message the server refused; it can be retried. */
  | 'failed'
  /** The assistant placeholder for a failed exchange; carries the error. */
  | 'error';

export type ThreadMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  answered: boolean | null;
  feedback: number | null;
  created_at: string;
  latency_ms: number | null;
  status: MessageStatus;
  error?: { code: ChatErrorCode; message: string };
};

/** The pair of messages a stream is writing into, by their current ids. */
export type ActiveExchange = { userId: string; assistantId: string };

export type Thread = {
  messages: ThreadMessage[];
  active: ActiveExchange | null;
};

/** The columns the thread reads from `messages`. */
export type MessageRow = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Json;
  answered: boolean | null;
  feedback: number | null;
  created_at: string;
  latency_ms: number | null;
};

export const THREAD_MESSAGE_COLUMNS = 'id, role, content, citations, answered, feedback, created_at, latency_ms';

export const emptyThread = (): Thread => ({ messages: [], active: null });

const isCitation = (value: unknown): value is Citation =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as Citation).index === 'number' &&
  typeof (value as Citation).title === 'string';

/** Citations are stored as jsonb; anything that is not the expected shape is dropped. */
export const parseCitations = (value: Json | null | undefined): Citation[] =>
  Array.isArray(value) ? value.filter(isCitation) : [];

export const messageFromRow = (row: MessageRow): ThreadMessage => ({
  id: row.id,
  role: row.role,
  content: row.content,
  citations: parseCitations(row.citations),
  answered: row.answered,
  feedback: row.feedback,
  created_at: row.created_at,
  latency_ms: row.latency_ms,
  status: 'complete',
});

export const threadFromRows = (rows: MessageRow[]): Thread => ({
  messages: rows.map(messageFromRow),
  active: null,
});

/**
 * Reconciles a fresh database read with what the cache holds. Rows from the server win; messages
 * the server does not know about yet (in flight, stopped, failed) are kept so a refetch never
 * makes a bubble vanish under the reader.
 */
export const mergeThread = (previous: Thread | undefined, rows: MessageRow[]): Thread => {
  const fetched = threadFromRows(rows);

  if (!previous) {
    return fetched;
  }

  const known = new Set(fetched.messages.map((message) => message.id));
  const local = previous.messages.filter(
    (message) => message.status !== 'complete' && !known.has(message.id),
  );

  return { messages: [...fetched.messages, ...local], active: previous.active };
};

export const TEMP_PREFIX = 'tmp_';

export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);

export const tempId = () => `${TEMP_PREFIX}${crypto.randomUUID()}`;

export type BeginExchangeInput = {
  userId: string;
  assistantId: string;
  content: string;
  now?: string;
};

/** Appends the reader's message and an empty assistant placeholder, and points `active` at them. */
export const beginExchange = (thread: Thread, input: BeginExchangeInput): Thread => {
  const now = input.now ?? new Date().toISOString();

  return {
    messages: [
      ...thread.messages,
      {
        id: input.userId,
        role: 'user',
        content: input.content,
        citations: [],
        answered: null,
        feedback: null,
        created_at: now,
        latency_ms: null,
        status: 'pending',
      },
      {
        id: input.assistantId,
        role: 'assistant',
        content: '',
        citations: [],
        answered: null,
        feedback: null,
        created_at: now,
        latency_ms: null,
        status: 'streaming',
      },
    ],
    active: { userId: input.userId, assistantId: input.assistantId },
  };
};

const patchMessage = (
  messages: ThreadMessage[],
  id: string,
  patch: Partial<ThreadMessage> | ((message: ThreadMessage) => Partial<ThreadMessage>),
) =>
  messages.map((message) =>
    message.id === id ? { ...message, ...(typeof patch === 'function' ? patch(message) : patch) } : message,
  );

/** Applies one protocol event to the exchange `thread.active` points at. Events with no active exchange are ignored. */
export const applyStreamEvent = (thread: Thread, event: ChatStreamEvent): Thread => {
  const active = thread.active;

  if (!active) {
    return thread;
  }

  switch (event.type) {
    case 'meta': {
      const messages = thread.messages.map((message) => {
        if (message.id === active.userId) {
          return { ...message, id: event.userMessageId, status: 'complete' as const };
        }

        if (message.id === active.assistantId) {
          return { ...message, id: event.assistantMessageId };
        }

        return message;
      });

      return { messages, active: { userId: event.userMessageId, assistantId: event.assistantMessageId } };
    }

    case 'token':
      return {
        ...thread,
        messages: patchMessage(thread.messages, active.assistantId, (message) => ({
          content: message.content + event.text,
        })),
      };

    case 'citations':
      return {
        ...thread,
        messages: patchMessage(thread.messages, active.assistantId, { citations: event.citations }),
      };

    case 'done':
      return {
        messages: patchMessage(
          patchMessage(thread.messages, active.userId, { status: 'complete' }),
          active.assistantId,
          { status: 'complete', answered: event.answered, latency_ms: event.latencyMs },
        ),
        active: null,
      };

    case 'error':
      return {
        messages: patchMessage(
          patchMessage(thread.messages, active.userId, { status: 'failed' }),
          active.assistantId,
          { status: 'error', error: { code: event.code, message: event.message } },
        ),
        active: null,
      };

    default:
      return thread;
  }
};

/** The reader pressed Stop: keep whatever text arrived and close the exchange. */
export const stopExchange = (thread: Thread): Thread => {
  const active = thread.active;

  if (!active) {
    return thread;
  }

  return {
    messages: patchMessage(
      patchMessage(thread.messages, active.userId, { status: 'complete' }),
      active.assistantId,
      { status: 'stopped' },
    ),
    active: null,
  };
};

/** Drops a user message and the assistant message that answers it, for a retry. */
export const removeExchange = (thread: Thread, userId: string): Thread => {
  const index = thread.messages.findIndex((message) => message.id === userId);

  if (index === -1) {
    return thread;
  }

  const next = thread.messages[index + 1];
  const span = next && next.role === 'assistant' ? 2 : 1;

  return {
    messages: [...thread.messages.slice(0, index), ...thread.messages.slice(index + span)],
    active:
      thread.active && (thread.active.userId === userId || thread.active.assistantId === next?.id)
        ? null
        : thread.active,
  };
};

export const setFeedback = (thread: Thread, messageId: string, value: number | null): Thread => ({
  ...thread,
  messages: patchMessage(thread.messages, messageId, { feedback: value }),
});

/** True while a stream is writing into the thread. */
export const isStreaming = (thread: Thread | undefined) => Boolean(thread?.active);

/** The failed user message that `retry` should resend, if any. */
export const failedMessage = (thread: Thread, userId: string) =>
  thread.messages.find((message) => message.id === userId && message.status === 'failed') ?? null;
