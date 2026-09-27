import type { ChatErrorCode, ChatStreamEvent, Citation } from '@parbot/shared';

import type { Json } from '@/lib/db/types';

import { type MessageReference, parseReferences } from './references';

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
  /**
   * The reader pressed Stop. The assistant's text is partial; the server keeps the question and
   * that text (with `answered` null), so a refetch replaces the pair with the stored rows.
   */
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
  /** On a question: the files and sources it was asked with, shown as chips on the bubble. */
  references?: MessageReference[];
  /** On an answer that has no text yet: what the engine is doing ("Reading guide.pdf…"). */
  progress?: string;
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
  /** Older reads and rows from before references existed have none. */
  source_references?: Json;
};

export const THREAD_MESSAGE_COLUMNS =
  'id, role, content, citations, answered, feedback, created_at, latency_ms, source_references';

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
  // The engine saves what the reader saw before pressing Stop with answered = null, so a reload
  // shows it as stopped, not as a finished answer.
  status: row.role === 'assistant' && row.answered === null ? 'stopped' : 'complete',
  ...(row.role === 'user' ? { references: parseReferences(row.source_references) } : {}),
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
  references?: MessageReference[];
  /** What the answer waits on before the request goes out, such as files still uploading. */
  progress?: string;
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
        references: input.references ?? [],
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
        ...(input.progress ? { progress: input.progress } : {}),
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
    message.id === id
      ? { ...message, ...(typeof patch === 'function' ? patch(message) : patch) }
      : message,
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

      return {
        messages,
        active: { userId: event.userMessageId, assistantId: event.assistantMessageId },
      };
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

    case 'status':
      return {
        ...thread,
        messages: patchMessage(thread.messages, active.assistantId, { progress: event.message }),
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
      patchMessage(thread.messages, active.userId, { status: 'stopped' }),
      active.assistantId,
      { status: 'stopped' },
    ),
    active: null,
  };
};

/**
 * Gives a stopped answer the citations the server saved with it (see `readStoppedCitations`), so
 * its markers and Sources show as they do after a reload. Any other message is left alone.
 */
export const setStoppedCitations = (
  thread: Thread,
  messageId: string,
  citations: Citation[],
): Thread =>
  thread.messages.some((message) => message.id === messageId && message.status === 'stopped')
    ? {
        ...thread,
        messages: thread.messages.map((message) =>
          message.id === messageId && message.status === 'stopped'
            ? { ...message, citations }
            : message,
        ),
      }
    : thread;

/** The text of the answer a stream is writing, exactly as the reader sees it; null when none is. */
export const activeAnswerText = (thread: Thread | undefined): string | null => {
  const active = thread?.active;

  if (!active) {
    return null;
  }

  return thread.messages.find((message) => message.id === active.assistantId)?.content ?? '';
};

/** Sets what the active answer is waiting on, or clears it with undefined. */
export const setProgress = (thread: Thread, progress: string | undefined): Thread => {
  const active = thread.active;

  return active
    ? { ...thread, messages: patchMessage(thread.messages, active.assistantId, { progress }) }
    : thread;
};

/** Replaces the references the active question shows, once the ones that failed to upload are gone. */
export const setActiveReferences = (thread: Thread, references: MessageReference[]): Thread => {
  const active = thread.active;

  return active
    ? { ...thread, messages: patchMessage(thread.messages, active.userId, { references }) }
    : thread;
};

/**
 * The conversation's references: the ones its latest question was asked with. The server keeps
 * the same set for follow-ups, so the composer starts from it.
 */
export const conversationReferences = (thread: Thread | undefined): MessageReference[] => {
  const messages = thread?.messages ?? [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;

    if (message.role === 'user') {
      return message.references ?? [];
    }
  }

  return [];
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
