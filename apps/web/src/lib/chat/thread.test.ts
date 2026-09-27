import type { ChatStreamEvent, Citation } from '@parbot/shared';
import { describe, expect, it } from 'vitest';

import {
  applyStreamEvent,
  beginExchange,
  conversationReferences,
  emptyThread,
  failedMessage,
  isStreaming,
  isTempId,
  mergeThread,
  type MessageRow,
  parseCitations,
  removeExchange,
  setActiveReferences,
  setFeedback,
  setProgress,
  setStoppedCitations,
  stopExchange,
  tempId,
  type Thread,
  threadFromRows,
} from './thread';

const started = () =>
  beginExchange(emptyThread(), {
    userId: 'tmp_user',
    assistantId: 'tmp_assistant',
    content: 'How do I rotate an API key?',
    now: '2026-09-23T10:00:00.000Z',
  });

const meta: ChatStreamEvent = {
  type: 'meta',
  conversationId: 'c1',
  userMessageId: 'u1',
  assistantMessageId: 'a1',
};

const citations: Citation[] = [
  {
    index: 1,
    documentId: 'd1',
    title: 'Authentication',
    url: 'https://docs.example.com/auth',
    snippet: 'API keys…',
  },
];

const run = (thread: Thread, events: ChatStreamEvent[]) => events.reduce(applyStreamEvent, thread);

describe('beginExchange', () => {
  it('appends a pending user message and a streaming placeholder', () => {
    const thread = started();

    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[0]).toMatchObject({
      id: 'tmp_user',
      role: 'user',
      status: 'pending',
      content: 'How do I rotate an API key?',
    });
    expect(thread.messages[1]).toMatchObject({
      id: 'tmp_assistant',
      role: 'assistant',
      status: 'streaming',
      content: '',
    });
    expect(thread.active).toEqual({ userId: 'tmp_user', assistantId: 'tmp_assistant' });
    expect(isStreaming(thread)).toBe(true);
  });

  it('keeps earlier messages', () => {
    const thread = beginExchange(started(), {
      userId: 'tmp_2',
      assistantId: 'tmp_3',
      content: 'And on Windows?',
    });

    expect(thread.messages.map((message) => message.id)).toEqual([
      'tmp_user',
      'tmp_assistant',
      'tmp_2',
      'tmp_3',
    ]);
  });
});

describe('applyStreamEvent', () => {
  it('ignores events when nothing is active', () => {
    const thread = emptyThread();

    expect(applyStreamEvent(thread, { type: 'token', text: 'hi' })).toBe(thread);
  });

  it('meta swaps the temporary ids for the real ones and confirms the user message', () => {
    const thread = applyStreamEvent(started(), meta);

    expect(thread.messages[0]).toMatchObject({ id: 'u1', status: 'complete' });
    expect(thread.messages[1]).toMatchObject({ id: 'a1', status: 'streaming' });
    expect(thread.active).toEqual({ userId: 'u1', assistantId: 'a1' });
  });

  it('tokens append to the placeholder, before and after meta', () => {
    const thread = run(started(), [
      { type: 'token', text: 'Rotate ' },
      meta,
      { type: 'token', text: 'it in ' },
      { type: 'token', text: 'Settings [1]' },
    ]);

    expect(thread.messages[1]).toMatchObject({
      id: 'a1',
      content: 'Rotate it in Settings [1]',
      status: 'streaming',
    });
    expect(thread.messages[0].content).toBe('How do I rotate an API key?');
  });

  it('citations land on the assistant message', () => {
    const thread = run(started(), [
      meta,
      { type: 'token', text: 'x' },
      { type: 'citations', citations },
    ]);

    expect(thread.messages[1].citations).toEqual(citations);
  });

  it('done completes both sides and records the answer metadata', () => {
    const thread = run(started(), [
      meta,
      { type: 'token', text: 'Answer' },
      { type: 'citations', citations },
      { type: 'done', answered: true, latencyMs: 820 },
    ]);

    expect(thread.active).toBeNull();
    expect(thread.messages[0]).toMatchObject({ status: 'complete' });
    expect(thread.messages[1]).toMatchObject({
      status: 'complete',
      answered: true,
      latency_ms: 820,
      content: 'Answer',
    });
    expect(isStreaming(thread)).toBe(false);
  });

  it('done with answered false marks the message unanswered', () => {
    const thread = run(started(), [
      meta,
      { type: 'token', text: 'No idea' },
      { type: 'done', answered: false, latencyMs: 40 },
    ]);

    expect(thread.messages[1]).toMatchObject({ answered: false, status: 'complete' });
  });

  it('error fails the user message and turns the placeholder into an error bubble', () => {
    const thread = applyStreamEvent(started(), {
      type: 'error',
      code: 'rate_limited',
      message: 'Slow down.',
    });

    expect(thread.active).toBeNull();
    expect(thread.messages[0]).toMatchObject({ id: 'tmp_user', status: 'failed' });
    expect(thread.messages[1]).toMatchObject({
      id: 'tmp_assistant',
      status: 'error',
      error: { code: 'rate_limited', message: 'Slow down.' },
    });
    expect(failedMessage(thread, 'tmp_user')?.content).toBe('How do I rotate an API key?');
  });

  it('an error after tokens keeps the partial text', () => {
    const thread = run(started(), [
      meta,
      { type: 'token', text: 'Part' },
      { type: 'error', code: 'internal', message: 'Lost.' },
    ]);

    expect(thread.messages[1]).toMatchObject({ id: 'a1', content: 'Part', status: 'error' });
    expect(thread.messages[0]).toMatchObject({ id: 'u1', status: 'failed' });
  });

  it('events after done do not touch anything', () => {
    const finished = run(started(), [meta, { type: 'done', answered: true, latencyMs: 1 }]);

    expect(applyStreamEvent(finished, { type: 'token', text: 'late' })).toBe(finished);
  });

  it('only the active exchange changes', () => {
    const earlier = run(started(), [
      meta,
      { type: 'token', text: 'first' },
      { type: 'done', answered: true, latencyMs: 1 },
    ]);
    const thread = run(
      beginExchange(earlier, { userId: 'tmp_u2', assistantId: 'tmp_a2', content: 'again' }),
      [{ type: 'token', text: 'second' }],
    );

    expect(thread.messages[1].content).toBe('first');
    expect(thread.messages[3].content).toBe('second');
  });
});

describe('stopExchange', () => {
  it('keeps the partial text, marks it stopped and closes the exchange', () => {
    const thread = stopExchange(run(started(), [meta, { type: 'token', text: 'Half an ' }]));

    expect(thread.active).toBeNull();
    expect(thread.messages[1]).toMatchObject({ status: 'stopped', content: 'Half an ' });
    // The server discards a stopped exchange, so the question is not confirmed either.
    expect(thread.messages[0]).toMatchObject({ status: 'stopped', id: 'u1' });
  });

  it('keeps a stopped pair across a refetch that does not have it', () => {
    const stopped = stopExchange(run(started(), [meta, { type: 'token', text: 'Half' }]));
    const merged = mergeThread(stopped, []);

    expect(merged.messages.map((message) => [message.id, message.status])).toEqual([
      ['u1', 'stopped'],
      ['a1', 'stopped'],
    ]);
  });

  it('is a no-op without an active exchange', () => {
    const thread = emptyThread();

    expect(stopExchange(thread)).toBe(thread);
  });

  it('gives a stopped answer the citations saved with it, and nothing else', () => {
    const stopped = stopExchange(run(started(), [meta, { type: 'token', text: 'Rotate it [1]' }]));
    const cited = setStoppedCitations(stopped, 'a1', citations);

    expect(cited.messages[1]).toMatchObject({ status: 'stopped', citations });
    expect(cited.messages[0]!.citations).toEqual([]);

    // A streaming answer gets its citations from the stream; an unknown id changes nothing.
    const streaming = run(started(), [meta, { type: 'token', text: 'Rotate it [1]' }]);

    expect(setStoppedCitations(streaming, 'a1', citations)).toBe(streaming);
    expect(setStoppedCitations(stopped, 'a2', citations)).toBe(stopped);
  });
});

describe('removeExchange', () => {
  it('drops the failed pair so it can be resent', () => {
    const failed = applyStreamEvent(started(), { type: 'error', code: 'internal', message: 'x' });
    const thread = removeExchange(failed, 'tmp_user');

    expect(thread.messages).toEqual([]);
    expect(thread.active).toBeNull();
  });

  it('drops only the user message when nothing answers it', () => {
    const thread = threadFromRows([
      {
        id: 'u1',
        role: 'user',
        content: 'a',
        citations: [],
        answered: null,
        feedback: null,
        created_at: 't',
        latency_ms: null,
      },
      {
        id: 'u2',
        role: 'user',
        content: 'b',
        citations: [],
        answered: null,
        feedback: null,
        created_at: 't',
        latency_ms: null,
      },
    ]);

    expect(removeExchange(thread, 'u1').messages.map((message) => message.id)).toEqual(['u2']);
  });

  it('leaves the thread alone for an unknown id', () => {
    const thread = started();

    expect(removeExchange(thread, 'nope')).toBe(thread);
  });
});

describe('setFeedback', () => {
  it('updates one message', () => {
    const thread = run(started(), [meta, { type: 'done', answered: true, latencyMs: 1 }]);

    expect(setFeedback(thread, 'a1', 1).messages[1].feedback).toBe(1);
    expect(setFeedback(thread, 'a1', null).messages[1].feedback).toBeNull();
  });
});

describe('mergeThread', () => {
  const rows: MessageRow[] = [
    {
      id: 'u1',
      role: 'user',
      content: 'q',
      citations: [],
      answered: null,
      feedback: null,
      created_at: 't1',
      latency_ms: null,
    },
    {
      id: 'a1',
      role: 'assistant',
      content: 'a',
      citations: [{ index: 1, documentId: 'd', title: 'T', url: null, snippet: 's' }],
      answered: true,
      feedback: 1,
      created_at: 't2',
      latency_ms: 300,
    },
  ];

  it('builds a thread from rows when nothing is cached', () => {
    const thread = mergeThread(undefined, rows);

    expect(thread.messages.map((message) => message.status)).toEqual(['complete', 'complete']);
    expect(thread.messages[1].citations[0]).toMatchObject({ index: 1, title: 'T' });
    expect(thread.active).toBeNull();
  });

  it('shows an answer saved when the reader pressed Stop as stopped after a reload', () => {
    const stopped: MessageRow = {
      ...rows[1]!,
      id: 'a2',
      content: 'Half an',
      citations: [],
      answered: null,
      feedback: null,
    };
    const thread = threadFromRows([rows[0]!, stopped]);

    expect(thread.messages.map((message) => message.status)).toEqual(['complete', 'stopped']);
    expect(thread.messages[1]).toMatchObject({ content: 'Half an' });
  });

  it('keeps in-flight and stopped messages the server does not know yet', () => {
    const cached = beginExchange(threadFromRows(rows), {
      userId: 'tmp_u',
      assistantId: 'tmp_a',
      content: 'more',
    });
    const thread = mergeThread(cached, rows);

    expect(thread.messages.map((message) => message.id)).toEqual(['u1', 'a1', 'tmp_u', 'tmp_a']);
    expect(thread.active).toEqual(cached.active);
  });

  it('lets server rows replace confirmed messages', () => {
    const cached = run(
      beginExchange(emptyThread(), { userId: 'tmp_u', assistantId: 'tmp_a', content: 'q' }),
      [meta, { type: 'token', text: 'a' }, { type: 'done', answered: true, latencyMs: 300 }],
    );
    const thread = mergeThread(cached, rows);

    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[1].feedback).toBe(1);
  });
});

describe('helpers', () => {
  it('parses citations defensively', () => {
    expect(parseCitations(null)).toEqual([]);
    expect(parseCitations('nope')).toEqual([]);
    expect(parseCitations([{ index: 1, title: 'x' }, { bad: true }, 3])).toEqual([
      { index: 1, title: 'x' },
    ]);
  });

  it('makes temporary ids that are recognisable', () => {
    const id = tempId();

    expect(isTempId(id)).toBe(true);
    expect(isTempId('0c9b9e5e-3d47-4a66-8b6e-3c1b8a1b7f00')).toBe(false);
  });
});

describe('references in the thread', () => {
  const limits = { id: 's1', title: 'limits.md', kind: 'upload' as const };
  const notes = { id: 's2', title: 'Refund policy', kind: 'text' as const };

  const row = (patch: Partial<MessageRow>): MessageRow => ({
    id: 'm',
    role: 'user',
    content: 'Hello',
    citations: [],
    answered: null,
    feedback: null,
    created_at: '2026-09-23T10:00:00.000Z',
    latency_ms: null,
    ...patch,
  });

  it('puts the references on the question and what the answer waits on beside it', () => {
    const thread = beginExchange(emptyThread(), {
      userId: 'tmp_u',
      assistantId: 'tmp_a',
      content: 'What does it say?',
      references: [limits],
      progress: 'Uploading limits.md…',
    });

    expect(thread.messages[0]).toMatchObject({ role: 'user', references: [limits] });
    expect(thread.messages[1]).toMatchObject({
      role: 'assistant',
      progress: 'Uploading limits.md…',
    });
    expect(setProgress(thread, undefined).messages[1]!.progress).toBeUndefined();
    expect(setActiveReferences(thread, []).messages[0]!.references).toEqual([]);
  });

  it("shows a status event as the answer's progress", () => {
    const thread = applyStreamEvent(applyStreamEvent(started(), meta), {
      type: 'status',
      message: 'Reading limits.md…',
    });

    expect(thread.messages[1]).toMatchObject({ id: 'a1', progress: 'Reading limits.md…' });
  });

  it('reads the references stored on a question, and none on an answer', () => {
    const thread = threadFromRows([
      row({ id: 'u1', source_references: [limits, { broken: true }] }),
      row({ id: 'a1', role: 'assistant', answered: true, source_references: [limits] }),
      row({ id: 'u2' }),
    ]);

    expect(thread.messages[0]!.references).toEqual([limits]);
    expect(thread.messages[1]!.references).toBeUndefined();
    expect(thread.messages[2]!.references).toEqual([]);
  });

  it("takes the conversation's references from its latest question", () => {
    const thread = threadFromRows([
      row({ id: 'u1', source_references: [limits] }),
      row({ id: 'a1', role: 'assistant', answered: true }),
      row({ id: 'u2', source_references: [limits, notes] }),
      row({ id: 'a2', role: 'assistant', answered: true }),
    ]);

    expect(conversationReferences(thread)).toEqual([limits, notes]);
    expect(conversationReferences(emptyThread())).toEqual([]);
    expect(conversationReferences(undefined)).toEqual([]);
  });
});
