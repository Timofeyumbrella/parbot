import { type ChatStreamEvent, encodeSseEvent } from '@parbot/shared';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationRow } from '@/lib/chat/conversations';
import { conversationsKey, threadKey } from '@/lib/chat/queries';
import type { MessageReference } from '@/lib/chat/references';
import { streamRegistry } from '@/lib/chat/streams';
import { isTempId, type Thread } from '@/lib/chat/thread';
import { composerUploads } from '@/lib/chat/uploads';

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
  const stops: { url: string; body: unknown; keepalive?: boolean }[] = [];
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/messages/')) {
      stops.push({ url, body: JSON.parse(String(init?.body)), keepalive: init?.keepalive });

      return Promise.resolve(Response.json({ stopped: true, answer: 'none' }));
    }

    init?.signal?.addEventListener('abort', () => {
      try {
        controller?.error(new DOMException('The operation was aborted.', 'AbortError'));
      } catch {
        // Already closed.
      }
    });

    return Promise.resolve(
      new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
    );
  });

  return {
    fetch,
    stops,
    push: (event: ChatStreamEvent) => controller?.enqueue(encoder.encode(encodeSseEvent(event))),
    close: () => controller?.close(),
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The answer id the client proposed with the question. */
const proposedId = (chat: ReturnType<typeof fakeChat>) =>
  (JSON.parse(chat.fetch.mock.calls[0]![1]!.body as string) as { assistantMessageId: string })
    .assistantMessageId;

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

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: '  Where are API keys?  ',
    });

    const before = thread();

    expect(before?.messages.map((message) => [message.role, message.status])).toEqual([
      ['user', 'pending'],
      ['assistant', 'streaming'],
    ]);
    expect(before?.messages[0]!.content).toBe('Where are API keys?');
    expect(before?.messages.every((message) => isTempId(message.id))).toBe(true);
    expect(list()).toEqual([
      expect.objectContaining({
        id: CONVERSATION,
        title: 'Where are API keys?',
        pending: true,
        message_count: 1,
      }),
    ]);

    expect(chat.fetch).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    );
    // The client proposes the answer's id, so Stop can name it before the stream says anything.
    expect(JSON.parse(chat.fetch.mock.calls[0]![1]!.body as string)).toEqual({
      assistantId: ASSISTANT,
      conversationId: CONVERSATION,
      message: 'Where are API keys?',
      assistantMessageId: expect.stringMatching(UUID),
    });
    expect(streamRegistry.target(CONVERSATION)).toEqual({
      assistantId: ASSISTANT,
      messageId: proposedId(chat),
    });

    chat.push(meta);
    chat.push({ type: 'done', answered: true, latencyMs: 12 });
    chat.close();
    await pending;
  });

  it('folds meta, tokens, citations and done into the thread and the list', async () => {
    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'Where are API keys?',
    });

    chat.push(meta);
    chat.push({ type: 'token', text: 'In ' });
    chat.push({ type: 'token', text: 'Settings ' });
    chat.push({ type: 'token', text: '[1]' });
    chat.push({
      type: 'citations',
      citations: [
        {
          index: 1,
          documentId: 'd1',
          title: 'Auth',
          url: 'https://docs.acme.test/auth',
          snippet: 's',
        },
      ],
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
      expect.objectContaining({
        id: CONVERSATION,
        pending: false,
        message_count: 2,
        unanswered_count: 0,
      }),
    ]);
    expect(streamRegistry.isStreaming(CONVERSATION)).toBe(false);
  });

  it('counts an unanswered reply on the list row', async () => {
    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'Unknown thing?',
    });

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
      {
        id: 'other',
        title: 'Newer',
        last_message_at: '2026-09-23T12:00:00.000Z',
        message_count: 2,
        unanswered_count: 0,
      },
      {
        id: CONVERSATION,
        title: 'Older',
        last_message_at: '2026-09-23T11:00:00.000Z',
        message_count: 2,
        unanswered_count: 0,
      },
    ]);

    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'Follow-up',
    });

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

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'Where are API keys?',
    });

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
    expect(JSON.parse(second.fetch.mock.calls[0]![1]!.body as string)).toMatchObject({
      message: 'Where are API keys?',
    });

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

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'Long one?',
    });

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
    expect(thread()?.messages[1]).toMatchObject({
      id: 'a1',
      status: 'stopped',
      content: 'The first half',
    });
    expect(thread()?.messages[0]).toMatchObject({ id: 'u1', status: 'stopped' });
    expect(streamRegistry.isStreaming(CONVERSATION)).toBe(false);
  });

  it('stop tells the server which answer stopped and exactly what the reader saw', async () => {
    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'Long one?',
    });

    chat.push(meta);
    chat.push({ type: 'token', text: 'Shown ' });

    await vi.waitFor(() => {
      expect(thread()?.messages[1]!.content).toBe('Shown ');
    });

    // A token read into the frame buffer but not yet painted when Stop lands is dropped, not
    // shown after it: the stop records what was on screen.
    chat.push({ type: 'token', text: 'unseen' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    stopMessage(queryClient, CONVERSATION);
    await pending;

    expect(thread()?.messages[1]).toMatchObject({ status: 'stopped', content: 'Shown ' });
    await vi.waitFor(() => {
      expect(chat.stops).toHaveLength(1);
    });
    expect(chat.stops[0]).toEqual({
      url: `/api/messages/${proposedId(chat)}/stop`,
      body: { assistantId: ASSISTANT, conversationId: CONVERSATION, text: 'Shown ' },
      keepalive: true,
    });
  });

  it('stop before the stream says anything still names the answer, with nothing shown', async () => {
    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'Quick one?',
    });

    stopMessage(queryClient, CONVERSATION);
    await pending;

    expect(thread()?.messages.map((message) => message.status)).toEqual(['stopped', 'stopped']);
    await vi.waitFor(() => {
      expect(chat.stops).toHaveLength(1);
    });
    expect(chat.stops[0]!.url).toBe(`/api/messages/${proposedId(chat)}/stop`);
    expect(chat.stops[0]!.body).toMatchObject({ text: '' });
  });

  it('stop after done has nothing to stop and tells the server nothing', async () => {
    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'Done already?',
    });

    chat.push(meta);
    chat.push({ type: 'token', text: 'All of it.' });
    chat.push({ type: 'done', answered: true, latencyMs: 5 });

    await vi.waitFor(() => {
      expect(thread()?.messages[1]!.status).toBe('complete');
    });

    // The stream is still open, so the registry still holds it; the answer is complete regardless.
    stopMessage(queryClient, CONVERSATION);
    await pending;

    expect(thread()?.messages[1]).toMatchObject({ status: 'complete', content: 'All of it.' });
    expect(chat.stops).toHaveLength(0);
  });

  it('stop with nothing in flight still closes a thread the cache believes is streaming', () => {
    queryClient.setQueryData<Thread>(threadKey(CONVERSATION), {
      messages: [
        {
          id: 'u',
          role: 'user',
          content: 'q',
          citations: [],
          answered: null,
          feedback: null,
          created_at: 't',
          latency_ms: null,
          status: 'pending',
        },
        {
          id: 'a',
          role: 'assistant',
          content: 'partial',
          citations: [],
          answered: null,
          feedback: null,
          created_at: 't',
          latency_ms: null,
          status: 'streaming',
        },
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

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'Hello?',
    });

    chat.push(meta);
    chat.push({ type: 'token', text: 'Part' });
    chat.close();
    await pending;

    expect(thread()?.messages[1]).toMatchObject({
      status: 'error',
      content: 'Part',
      error: {
        code: 'internal',
        message: 'The connection closed before the answer finished. Try again.',
      },
    });
    expect(thread()?.messages[0]).toMatchObject({ status: 'failed' });
  });

  it('turns a network failure into an error bubble without echoing the browser', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    await sendMessage(queryClient, ASSISTANT, { conversationId: CONVERSATION, content: 'Hello?' });

    expect(thread()?.messages[1]).toMatchObject({
      status: 'error',
      error: {
        code: 'internal',
        message: 'The message did not reach the server. Check your connection and try again.',
      },
    });
    expect(thread()?.messages[0]).toMatchObject({ status: 'failed' });
    expect(streamRegistry.isStreaming(CONVERSATION)).toBe(false);
  });

  it('reports a response that is not an event stream by its status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<html>Internal Server Error</html>', {
            status: 500,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    );

    await sendMessage(queryClient, ASSISTANT, { conversationId: CONVERSATION, content: 'Hello?' });

    expect(thread()?.messages[1]).toMatchObject({
      status: 'error',
      error: {
        code: 'internal',
        message: 'The server could not answer (500). Try again in a moment.',
      },
    });
    expect(thread()?.active).toBeNull();
    expect(streamRegistry.isStreaming(CONVERSATION)).toBe(false);
  });

  it('tells the inbox to refetch once the exchange is saved', async () => {
    const chat = fakeChat();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'Hello?',
    });

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

describe('sendMessage with references', () => {
  const limits: MessageReference = {
    id: '33333333-3333-4333-8333-333333333333',
    title: 'limits.md',
    kind: 'upload',
  };
  const notes: MessageReference = {
    id: '44444444-4444-4444-8444-444444444444',
    title: 'Refund policy',
    kind: 'text',
  };

  /** The chat as fakeChat, plus /api/sources answered when the test says so. */
  const withUploads = () => {
    const chat = fakeChat();
    const uploads: { resolve: (response: Response) => void; body: FormData }[] = [];
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/sources') {
        return new Promise<Response>((resolve) => {
          uploads.push({ resolve, body: init?.body as FormData });
        });
      }

      return chat.fetch(url, init);
    });

    return { chat, fetch, uploads };
  };

  const chatBodies = (fetch: ReturnType<typeof vi.fn>) =>
    fetch.mock.calls
      .filter(([url]) => url === '/api/chat')
      .map(
        ([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>,
      );

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    composerUploads.reset();
  });

  it('shows the chips on the question at once and sends their ids', async () => {
    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'What does this say about limits?',
      references: [limits, notes],
    });

    expect(thread()?.messages[0]).toMatchObject({
      role: 'user',
      status: 'pending',
      references: [limits, notes],
    });
    expect(chatBodies(chat.fetch)[0]).toMatchObject({ references: [limits.id, notes.id] });

    chat.push(meta);
    chat.push({ type: 'status', message: 'Reading limits.md…' });
    await flush();
    expect(thread()?.messages[1]).toMatchObject({
      status: 'streaming',
      progress: 'Reading limits.md…',
    });

    chat.push({ type: 'done', answered: true, latencyMs: 3 });
    chat.close();
    await pending;
  });

  it('sends an empty list when the reader removed every chip, so the conversation drops them', async () => {
    const chat = fakeChat();

    vi.stubGlobal('fetch', chat.fetch);

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'And without the file?',
      references: [],
    });

    expect(chatBodies(chat.fetch)[0]).toMatchObject({ references: [] });
    chat.push(meta);
    chat.push({ type: 'done', answered: true, latencyMs: 3 });
    chat.close();
    await pending;
  });

  it('waits for a file that is still uploading, saying so, then sends it', async () => {
    const { chat, fetch, uploads } = withUploads();

    vi.stubGlobal('fetch', fetch);

    const file = new File(['# Limits'], 'limits.md', { type: 'text/markdown' });
    const upload = composerUploads.start({ id: limits.id, assistantId: ASSISTANT, file });
    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'What does this file say?',
      references: [limits],
    });

    // The question and its chip are on screen; the answer says what it is waiting for.
    expect(thread()?.messages.map((message) => message.status)).toEqual(['pending', 'streaming']);
    expect(thread()?.messages[0]!.references).toEqual([limits]);
    expect(thread()?.messages[1]!.progress).toBe('Uploading limits.md…');
    await flush();
    expect(chatBodies(fetch)).toEqual([]);
    expect(uploads[0]!.body.get('id')).toBe(limits.id);
    expect(uploads[0]!.body.get('assistantId')).toBe(ASSISTANT);

    uploads[0]!.resolve(Response.json({ source: { id: limits.id } }, { status: 201 }));
    await upload;
    await flush();

    expect(chatBodies(fetch)[0]).toMatchObject({ references: [limits.id] });
    expect(thread()?.messages[1]!.progress).toBeUndefined();

    chat.push(meta);
    chat.push({ type: 'done', answered: true, latencyMs: 3 });
    chat.close();
    await pending;
  });

  it('leaves out a file the server refused and still asks the question', async () => {
    const { chat, fetch, uploads } = withUploads();

    vi.stubGlobal('fetch', fetch);

    const file = new File(['x'], 'limits.md', { type: 'text/markdown' });

    void composerUploads.start({ id: limits.id, assistantId: ASSISTANT, file });

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'Compare them.',
      references: [limits, notes],
    });

    uploads[0]!.resolve(
      Response.json({ error: "Your plan's page limit is reached." }, { status: 403 }),
    );
    await flush();
    await flush();

    expect(composerUploads.state(limits.id)).toEqual({
      status: 'failed',
      error: "Your plan's page limit is reached.",
    });
    expect(chatBodies(fetch)[0]).toMatchObject({ references: [notes.id] });
    expect(thread()?.messages[0]!.references).toEqual([notes]);

    chat.push(meta);
    chat.push({ type: 'done', answered: true, latencyMs: 3 });
    chat.close();
    await pending;
  });

  it('stops at once while a file uploads, and never asks the server', async () => {
    const { fetch, uploads } = withUploads();

    vi.stubGlobal('fetch', fetch);

    void composerUploads.start({
      id: limits.id,
      assistantId: ASSISTANT,
      file: new File(['x'], 'limits.md'),
    });

    const pending = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'Never mind.',
      references: [limits],
    });

    stopMessage(queryClient, CONVERSATION);
    await pending;

    expect(thread()?.messages.map((message) => message.status)).toEqual(['stopped', 'stopped']);
    expect(chatBodies(fetch)).toEqual([]);
    uploads[0]!.resolve(Response.json({ source: { id: limits.id } }, { status: 201 }));
  });

  it('retries a failed question with the references it was asked with', async () => {
    const first = fakeChat();

    vi.stubGlobal('fetch', first.fetch);

    const failed = sendMessage(queryClient, ASSISTANT, {
      conversationId: CONVERSATION,
      content: 'What does it say?',
      references: [notes],
    });

    first.push({ type: 'error', code: 'internal', message: 'The answer could not be produced.' });
    first.close();
    await failed;

    const userId = thread()!.messages[0]!.id;
    const second = fakeChat();

    vi.stubGlobal('fetch', second.fetch);

    const retried = retryMessage(queryClient, ASSISTANT, CONVERSATION, userId);

    expect(chatBodies(second.fetch)[0]).toMatchObject({ references: [notes.id] });
    expect(thread()?.messages[0]!.references).toEqual([notes]);
    second.push(meta);
    second.push({ type: 'done', answered: true, latencyMs: 3 });
    second.close();
    await retried;
  });
});
