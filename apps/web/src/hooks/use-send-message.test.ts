import { type ChatStreamEvent, encodeSseEvent } from '@parbot/shared';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationRow } from '@/lib/chat/conversations';
import { conversationsKey, threadKey } from '@/lib/chat/queries';
import { streamRegistry } from '@/lib/chat/streams';
import { isTempId, type Thread } from '@/lib/chat/thread';

import { retryMessage, sendMessage, stopMessage } from './use-send-message';

const ASSISTANT = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';
const encoder = new TextEncoder();

/** A fake /api/chat: events are pushed one at a time, and an aborted request errors the stream like fetch does. */
const fakeChat = () => {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
    },
  });
  const fetch = vi.fn((_: string, init?: RequestInit) => {
    init?.signal?.addEventListener('abort', () => {
      try {
        controller?.error(new DOMException('The operation was aborted.', 'AbortError'));
      } catch {
        // Already closed.
      }
    });

    return Promise.resolve(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }));
  });

  return {
    fetch,
    push: (event: ChatStreamEvent) => controller?.enqueue(encoder.encode(encodeSseEvent(event))),
    close: () => controller?.close(),
  };
};

const meta: ChatStreamEvent = {
  type: 'meta',
  conversationId: CONVERSATION,
  userMessageId: 'u1',
  assistantMessageId: 'a1',
};

let queryClient: QueryClient;

const thread = () => queryClient.getQueryData<Thread>(threadKey(CONVERSATION));
const list = () => queryClient.getQueryData<ConversationRow[]>(conversationsKey(ASSISTANT));

beforeEach(() => {
  queryClient = new QueryClient();
  streamRegistry.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendMessage', () => {
  it('puts the question and an empty answer in the cache before the request resolves', async () => {
    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, { conversationId: CONVERSATION, content: '  Where are API keys?  ' });

    const before = thread();

    expect(before?.messages.map((message) => [message.role, message.status])).toEqual([
      ['user', 'pending'],
      ['assistant', 'streaming'],
    ]);
    expect(before?.messages[0]!.content).toBe('Where are API keys?');
    expect(before?.messages.every((message) => isTempId(message.id))).toBe(true);
    expect(list()).toEqual([
      expect.objectContaining({ id: CONVERSATION, title: 'Where are API keys?', pending: true, message_count: 1 }),
    ]);

    expect(chat.fetch).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ assistantId: ASSISTANT, conversationId: CONVERSATION, message: 'Where are API keys?' }),
        signal: expect.any(AbortSignal),
      }),
    );

    chat.push(meta);
    chat.push({ type: 'done', answered: true, latencyMs: 12 });
    chat.close();
    await pending;
  });

  it('folds meta, tokens, citations and done into the thread and the list', async () => {
    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, { conversationId: CONVERSATION, content: 'Where are API keys?' });

    chat.push(meta);
    chat.push({ type: 'token', text: 'In ' });
    chat.push({ type: 'token', text: 'Settings ' });
    chat.push({ type: 'token', text: '[1]' });
    chat.push({
      type: 'citations',
      citations: [{ index: 1, documentId: 'd1', title: 'Auth', url: 'https://docs.acme.test/auth', snippet: 's' }],
    });
    chat.push({ type: 'done', answered: true, latencyMs: 640 });
    chat.close();
    await pending;

    const after = thread();

    expect(after?.active).toBeNull();
    expect(after?.messages[0]).toMatchObject({ id: 'u1', role: 'user', status: 'complete' });
    expect(after?.messages[1]).toMatchObject({
      id: 'a1',
      role: 'assistant',
      status: 'complete',
      content: 'In Settings [1]',
      answered: true,
      latency_ms: 640,
    });
    expect(after?.messages[1]!.citations).toHaveLength(1);
    expect(list()).toEqual([
      expect.objectContaining({ id: CONVERSATION, pending: false, message_count: 2, unanswered_count: 0 }),
    ]);
    expect(streamRegistry.isStreaming(CONVERSATION)).toBe(false);
  });

  it('counts an unanswered reply on the list row', async () => {
    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, { conversationId: CONVERSATION, content: 'Unknown thing?' });

    chat.push(meta);
    chat.push({ type: 'token', text: 'I could not find that.' });
    chat.push({ type: 'citations', citations: [] });
    chat.push({ type: 'done', answered: false, latencyMs: 30 });
    chat.close();
    await pending;

    expect(thread()?.messages[1]).toMatchObject({ answered: false, status: 'complete' });
    expect(list()?.[0]).toMatchObject({ unanswered_count: 1 });
  });

  it('moves an existing conversation to the top and keeps its title', async () => {
    queryClient.setQueryData<ConversationRow[]>(conversationsKey(ASSISTANT), [
      { id: 'other', title: 'Newer', last_message_at: '2026-09-23T12:00:00.000Z', message_count: 2, unanswered_count: 0 },
      { id: CONVERSATION, title: 'Older', last_message_at: '2026-09-23T11:00:00.000Z', message_count: 2, unanswered_count: 0 },
    ]);

    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, { conversationId: CONVERSATION, content: 'Follow-up' });

    expect(list()?.map((row) => row.id)).toEqual([CONVERSATION, 'other']);
    expect(list()?.[0]).toMatchObject({ title: 'Older', message_count: 3 });
    expect(list()?.[0]!.pending).toBeFalsy();

    chat.push(meta);
    chat.push({ type: 'done', answered: true, latencyMs: 1 });
    chat.close();
    await pending;
  });

  it('an error event fails the pair, and retry drops it and sends the same text again', async () => {
    const first = fakeChat();

    vi.stubGlobal('fetch', first.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, { conversationId: CONVERSATION, content: 'Where are API keys?' });

    first.push({ type: 'error', code: 'quota_exceeded', message: 'Out of answers this month.' });
    first.close();
    await pending;

    const failed = thread();

    expect(failed?.active).toBeNull();
    expect(failed?.messages[0]).toMatchObject({ role: 'user', status: 'failed' });
    expect(failed?.messages[1]).toMatchObject({
      role: 'assistant',
      status: 'error',
      error: { code: 'quota_exceeded', message: 'Out of answers this month.' },
    });

    const second = fakeChat();

    vi.stubGlobal('fetch', second.fetch);

    const retrying = retryMessage(queryClient, ASSISTANT, CONVERSATION, failed!.messages[0]!.id);

    expect(thread()?.messages.map((message) => message.status)).toEqual(['pending', 'streaming']);
    expect(second.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(second.fetch.mock.calls[0]![1]!.body as string)).toMatchObject({ message: 'Where are API keys?' });

    second.push(meta);
    second.push({ type: 'token', text: 'Settings.' });
    second.push({ type: 'done', answered: true, latencyMs: 9 });
    second.close();
    await retrying;

    expect(thread()?.messages.map((message) => [message.id, message.status])).toEqual([
      ['u1', 'complete'],
      ['a1', 'complete'],
    ]);
  });

  it('retry does nothing for a message that did not fail', async () => {
    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);
    await retryMessage(queryClient, ASSISTANT, CONVERSATION, 'nope');

    expect(chat.fetch).not.toHaveBeenCalled();
    expect(thread()).toBeUndefined();
  });

  it('stop aborts the request and keeps the partial text', async () => {
    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, { conversationId: CONVERSATION, content: 'Long one?' });

    chat.push(meta);
    chat.push({ type: 'token', text: 'The first half' });

    await vi.waitFor(() => {
      expect(thread()?.messages[1]!.content).toBe('The first half');
    });
    expect(streamRegistry.isStreaming(CONVERSATION)).toBe(true);

    stopMessage(queryClient, CONVERSATION);
    await pending;

    const signal = chat.fetch.mock.calls[0]![1]!.signal as AbortSignal;

    expect(signal.aborted).toBe(true);
    expect(thread()?.active).toBeNull();
    expect(thread()?.messages[1]).toMatchObject({ id: 'a1', status: 'stopped', content: 'The first half' });
    expect(thread()?.messages[0]).toMatchObject({ id: 'u1', status: 'stopped' });
    expect(streamRegistry.isStreaming(CONVERSATION)).toBe(false);
  });

  it('stop with nothing in flight still closes a thread the cache believes is streaming', () => {
    queryClient.setQueryData<Thread>(threadKey(CONVERSATION), {
      messages: [
        { id: 'u', role: 'user', content: 'q', citations: [], answered: null, feedback: null, created_at: 't', latency_ms: null, status: 'pending' },
        { id: 'a', role: 'assistant', content: 'partial', citations: [], answered: null, feedback: null, created_at: 't', latency_ms: null, status: 'streaming' },
      ],
      active: { userId: 'u', assistantId: 'a' },
    });

    stopMessage(queryClient, CONVERSATION);

    expect(thread()?.active).toBeNull();
    expect(thread()?.messages.map((message) => message.status)).toEqual(['stopped', 'stopped']);
  });

  it('reports a stream that closes before done as a failure the reader can retry', async () => {
    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, { conversationId: CONVERSATION, content: 'Hello?' });

    chat.push(meta);
    chat.push({ type: 'token', text: 'Part' });
    chat.close();
    await pending;

    expect(thread()?.messages[1]).toMatchObject({
      status: 'error',
      content: 'Part',
      error: { code: 'internal', message: 'The connection closed before the answer finished. Try again.' },
    });
    expect(thread()?.messages[0]).toMatchObject({ status: 'failed' });
  });

  it('turns a network failure into an error bubble without echoing the browser', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));

    await sendMessage(queryClient, ASSISTANT, { conversationId: CONVERSATION, content: 'Hello?' });

    expect(thread()?.messages[1]).toMatchObject({
      status: 'error',
      error: { code: 'internal', message: 'The message did not reach the server. Check your connection and try again.' },
    });
    expect(thread()?.messages[0]).toMatchObject({ status: 'failed' });
    expect(streamRegistry.isStreaming(CONVERSATION)).toBe(false);
  });

  it('reports a response that is not an event stream by its status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Internal Server Error</html>', { status: 500, headers: { 'content-type': 'text/html' } })),
    );

    await sendMessage(queryClient, ASSISTANT, { conversationId: CONVERSATION, content: 'Hello?' });

    expect(thread()?.messages[1]).toMatchObject({
      status: 'error',
      error: { code: 'internal', message: 'The server could not answer (500). Try again in a moment.' },
    });
    expect(thread()?.active).toBeNull();
    expect(streamRegistry.isStreaming(CONVERSATION)).toBe(false);
  });

  it('tells the inbox to refetch once the exchange is saved', async () => {
    const chat = fakeChat();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, { conversationId: CONVERSATION, content: 'Hello?' });

    chat.push(meta);
    expect(invalidate).not.toHaveBeenCalled();
    chat.push({ type: 'done', answered: true, latencyMs: 3 });
    chat.close();
    await pending;

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inbox'] });
  });

  it('ignores an empty message', async () => {
    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);
    await sendMessage(queryClient, ASSISTANT, { conversationId: CONVERSATION, content: '   ' });

    expect(chat.fetch).not.toHaveBeenCalled();
    expect(thread()).toBeUndefined();
  });
});
