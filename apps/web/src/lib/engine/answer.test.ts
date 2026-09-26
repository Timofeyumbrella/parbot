// @vitest-environment node
import type { ChatStreamEvent } from '@parbot/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type AiProvider, type GenerateChunk, type GenerateResult, ModelBusyError } from '@/lib/ai';
import { PLANS } from '@/lib/plans';

import { ANSWER_ERROR_COPY, historyTurns, streamAnswer } from './answer';
import { UNANSWERED_TEXT } from './prompt';
import type { ServiceClient } from './retrieval';

/**
 * Just enough of the supabase-js query builder for streamAnswer: every table call records what
 * was asked and resolves from the rows configured here, so the engine's decisions can be tested
 * without a database.
 */

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: unknown; filters: Record<string, unknown> };

type FakeOptions = {
  /** What successive reads of the conversation return; the last entry repeats. */
  conversationReads?: (Row | null)[];
  history?: Row[];
  chunks?: Row[];
  reserved?: boolean;
  conversationInsertError?: { code: string; message: string } | null;
  assistantInsertError?: { code: string; message: string } | null;
  /** The reader's recorded stop, read afresh on every look. */
  stop?: () => Row | null;
  /** The saved answer a late stop reads back. */
  savedAnswer?: Row | null;
};

const fakeService = (options: FakeOptions = {}) => {
  const calls: Call[] = [];
  const rpcCalls: { fn: string; args: Row }[] = [];
  const reads = options.conversationReads ?? [null];
  let conversationReadCount = 0;
  let inserted = 0;

  const resolve = (call: Call) => {
    switch (`${call.table}/${call.op}`) {
      case 'conversations/select': {
        const row = reads[Math.min(conversationReadCount, reads.length - 1)] ?? null;
        conversationReadCount += 1;

        return { data: row, error: null };
      }
      case 'conversations/insert':
        return { data: null, error: options.conversationInsertError ?? null };
      case 'messages/select':
        // A read by id is a late stop looking for the saved answer; anything else is the history.
        return 'id' in call.filters
          ? { data: options.savedAnswer ?? null, error: null }
          : { data: options.history ?? [], error: null };
      case 'messages/update':
        return { data: [{ id: call.filters.id }], error: null };
      case 'message_stops/select':
        return { data: options.stop?.() ?? null, error: null };
      case 'messages/insert': {
        const payload = call.payload as Row;

        if (payload.role === 'assistant' && options.assistantInsertError) {
          return { data: null, error: options.assistantInsertError };
        }

        inserted += 1;

        return { data: { id: `m${inserted}` }, error: null };
      }
      default:
        return { data: null, error: null };
    }
  };

  const from = (table: string) => {
    const call: Call = { table, op: 'select', filters: {} };
    calls.push(call);

    const chain = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: (column: string, value: unknown) => {
        call.filters[column] = value;

        return chain;
      },
      is: (column: string, value: unknown) => {
        call.filters[`${column} is`] = value;

        return chain;
      },
      not: (column: string, operator: string, value: unknown) => {
        call.filters[`${column} not ${operator}`] = value;

        return chain;
      },
      insert: (payload: unknown) => {
        call.op = 'insert';
        call.payload = payload;

        return chain;
      },
      update: (payload: unknown) => {
        call.op = 'update';
        call.payload = payload;

        return chain;
      },
      delete: () => {
        call.op = 'delete';

        return chain;
      },
      single: () => Promise.resolve(resolve(call)),
      maybeSingle: () => Promise.resolve(resolve(call)),
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolve(call)).then(onFulfilled, onRejected),
    };

    return chain;
  };

  const rpc = (fn: string, args: Row) => {
    rpcCalls.push({ fn, args });

    switch (fn) {
      case 'match_chunks':
        return Promise.resolve({ data: options.chunks ?? [], error: null });
      case 'reserve_message':
        return Promise.resolve({ data: options.reserved ?? true, error: null });
      default:
        return Promise.resolve({ data: null, error: null });
    }
  };

  const find = (table: string, op: string) =>
    calls.filter((call) => call.table === table && call.op === op);
  const rpcNames = () =>
    rpcCalls
      .map((call) => call.fn)
      .filter((fn) => fn !== 'match_chunks' && fn !== 'reserve_message');

  return {
    service: { from, rpc } as unknown as ServiceClient,
    calls,
    rpcCalls,
    find,
    rpcNames,
  };
};

const chunk = (content: string): Row => ({
  chunk_id: 'c1',
  document_id: 'd1',
  document_title: 'Setup',
  document_url: 'https://docs.example.com/setup',
  heading: null,
  content,
  similarity: 0.9,
});

type ProviderOptions = {
  answer?: string;
  failWith?: Error;
  /** A pause before each word, like a model streaming over the network. */
  delayMs?: number;
};

/**
 * Records the embedding queries it was asked for and answers with a fixed text, a word at a time.
 * Like the real providers, it throws once the request's signal is aborted.
 */
const fakeProvider = (options: ProviderOptions = {}) => {
  const embedded: string[] = [];
  const answer =
    options.answer ??
    'Pick the palette mode in Settings, then choose a shortcut for opening it from any page. [1]';

  const stream = async function* (input: {
    signal?: AbortSignal;
  }): AsyncGenerator<GenerateChunk, GenerateResult> {
    if (options.failWith) {
      throw options.failWith;
    }

    for (const word of answer.split(' ')) {
      await (options.delayMs
        ? new Promise((resolve) => setTimeout(resolve, options.delayMs))
        : Promise.resolve());

      if (input.signal?.aborted) {
        throw new DOMException('The answer was stopped.', 'AbortError');
      }

      yield { text: `${word} ` };
    }

    return { model: 'fake', promptTokens: 1, completionTokens: 1 };
  };

  const provider: AiProvider = {
    name: 'stub',
    embed: (inputs) => {
      embedded.push(...inputs.map((input) => input.text));

      return Promise.resolve(inputs.map(() => [1, 0, 0]));
    },
    stream,
    generate: () => Promise.reject(new Error('not used')),
  };

  return { provider, embedded };
};

const assistant = { id: 'a1', owner_id: 'o1', name: 'Docs', instructions: null };
const ownConversation = {
  id: 'c1',
  assistant_id: 'a1',
  channel: 'app',
  visitor_id: null,
  title: 'T',
};

const collect = async (events: AsyncGenerator<ChatStreamEvent>) => {
  const list: ChatStreamEvent[] = [];

  for await (const event of events) {
    list.push(event);
  }

  return list;
};

const tokenText = (events: ChatStreamEvent[]) =>
  events.map((event) => (event.type === 'token' ? event.text : '')).join('');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('historyTurns', () => {
  it('orders the rows oldest first', () => {
    expect(
      historyTurns([
        { role: 'assistant', content: 'A2' },
        { role: 'user', content: 'Q2' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'Q1' },
      ]),
    ).toEqual([
      { role: 'user', text: 'Q1' },
      { role: 'model', text: 'A1' },
      { role: 'user', text: 'Q2' },
      { role: 'model', text: 'A2' },
    ]);
  });

  it('leaves out a question that was stopped before any answer, and a leading answer', () => {
    expect(
      historyTurns([
        { role: 'user', content: 'Stopped before text' },
        { role: 'assistant', content: 'A2' },
        { role: 'user', content: 'Q2' },
        { role: 'user', content: 'Also stopped' },
        { role: 'assistant', content: 'A1, cut by the window' },
      ]),
    ).toEqual([
      { role: 'user', text: 'Q2' },
      { role: 'model', text: 'A2' },
    ]);
  });
});

describe('streamAnswer follow-up retrieval', () => {
  it('folds the latest question, not the oldest, into a short follow-up', async () => {
    // Newest first, the way the engine reads the history.
    const history = [
      { role: 'assistant', content: 'Open Settings and pick Palette.' },
      { role: 'user', content: 'How do I set up the palette mode' },
      { role: 'assistant', content: 'The Hobby plan is free.' },
      { role: 'user', content: 'What does the Hobby plan cost' },
    ];
    const { service } = fakeService({
      conversationReads: [{ ...ownConversation, title: 'Plans' }],
      history,
      chunks: [chunk('Pick the palette mode in Settings.')],
    });
    const { provider, embedded } = fakeProvider();

    await collect(
      streamAnswer({
        service,
        provider,
        assistant,
        conversation: { id: 'c1', channel: 'app' },
        message: 'and on Windows?',
      }),
    );

    expect(embedded).toEqual(['How do I set up the palette mode and on Windows?']);
  });

  it('sends the history to the model oldest first', async () => {
    const history = [
      { role: 'assistant', content: 'A2' },
      { role: 'user', content: 'Q2' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q1' },
    ];
    const { service } = fakeService({
      conversationReads: [ownConversation],
      history,
      chunks: [chunk('Something relevant.')],
    });
    const { provider } = fakeProvider();
    const seen: string[] = [];
    const stream = provider.stream;

    provider.stream = (input) => {
      seen.push(...input.turns.map((turn) => turn.text));

      return stream(input);
    };

    await collect(
      streamAnswer({
        service,
        provider,
        assistant,
        conversation: { id: 'c1', channel: 'app' },
        message: 'A question long enough to stand on its own here',
      }),
    );

    expect(seen.slice(0, 4)).toEqual(['Q1', 'A1', 'Q2', 'A2']);
  });
});

describe('streamAnswer error copy', () => {
  it('never sends the provider or database text; the code carries the meaning', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { service } = fakeService({
      conversationReads: [ownConversation],
      chunks: [chunk('Relevant.')],
    });
    const { provider } = fakeProvider();

    provider.embed = () => Promise.reject(new Error('relation "public.chunks" does not exist'));

    const events = await collect(
      streamAnswer({
        service,
        provider,
        assistant,
        conversation: { id: 'c1', channel: 'app' },
        message: 'A question',
      }),
    );

    expect(events.at(-1)).toEqual({
      type: 'error',
      code: 'internal',
      message: ANSWER_ERROR_COPY.internal,
    });
    expect(JSON.stringify(events)).not.toMatch(/relation|public\.chunks/);
  });

  it('maps a busy model to its own code and sentence', async () => {
    const { service } = fakeService({
      conversationReads: [ownConversation],
      chunks: [chunk('Relevant.')],
    });
    const { provider } = fakeProvider({ failWith: new ModelBusyError(['gemini-3.8-flash']) });

    const events = await collect(
      streamAnswer({
        service,
        provider,
        assistant,
        conversation: { id: 'c1', channel: 'app' },
        message: 'A question',
      }),
    );

    expect(events.at(-1)).toEqual({
      type: 'error',
      code: 'model_busy',
      message: ANSWER_ERROR_COPY.model_busy,
    });
    expect(JSON.stringify(events)).not.toMatch(/gemini/);
  });
});

describe('streamAnswer metering', () => {
  it('reserves a slot against the plan limit and keeps it when the answer is saved', async () => {
    const fake = fakeService({
      conversationReads: [ownConversation],
      chunks: [chunk('Relevant.')],
    });
    const { provider } = fakeProvider();

    const events = await collect(
      streamAnswer({
        service: fake.service,
        provider,
        assistant,
        conversation: { id: 'c1', channel: 'app' },
        message: 'Where is the palette?',
      }),
    );

    expect(events.at(-1)).toMatchObject({ type: 'done', answered: true });
    expect(fake.rpcCalls.find((call) => call.fn === 'reserve_message')?.args).toEqual({
      owner: 'o1',
      max_allowed: PLANS.hobby.messagesPerMonth,
    });
    expect(fake.rpcNames()).toEqual([]);
  });

  it('refuses without writing anything when no slot is left', async () => {
    const fake = fakeService({ conversationReads: [null], reserved: false });
    const { provider } = fakeProvider();

    const events = await collect(
      streamAnswer({
        service: fake.service,
        provider,
        assistant,
        conversation: { id: 'c1', channel: 'app' },
        message: 'Where is the palette?',
      }),
    );

    expect(events).toEqual([
      { type: 'error', code: 'quota_exceeded', message: expect.stringContaining('200 answers') },
    ]);
    expect(fake.find('conversations', 'insert')).toHaveLength(0);
    expect(fake.find('messages', 'insert')).toHaveLength(0);
    expect(fake.rpcNames()).toEqual([]);
  });

  it('checks the conversation before it takes a slot', async () => {
    const fake = fakeService({
      conversationReads: [{ ...ownConversation, assistant_id: 'someone-else' }],
    });
    const { provider } = fakeProvider();

    const events = await collect(
      streamAnswer({
        service: fake.service,
        provider,
        assistant,
        conversation: { id: 'c1', channel: 'app' },
        message: 'Where is the palette?',
      }),
    );

    expect(events).toEqual([{ type: 'error', code: 'not_found', message: expect.any(String) }]);
    expect(fake.rpcCalls).toEqual([]);
  });
});

describe('streamAnswer rollback', () => {
  it('removes the question and the conversation it created when the model fails before any text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const fake = fakeService({ conversationReads: [null], chunks: [chunk('Relevant.')] });
    const { provider } = fakeProvider({ failWith: new Error('upstream exploded') });

    const events = await collect(
      streamAnswer({
        service: fake.service,
        provider,
        assistant,
        conversation: { id: 'c-new', channel: 'app' },
        message: 'Where is the palette?',
      }),
    );

    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'internal' });
    expect(fake.find('messages', 'delete').map((call) => call.filters)).toEqual([{ id: 'm1' }]);
    // The trigger moved message_count back to zero; a conversation someone else wrote to stays.
    expect(fake.find('conversations', 'delete').map((call) => call.filters)).toEqual([
      { id: 'c-new', message_count: 0 },
    ]);
    expect(fake.rpcNames()).toEqual(['release_message']);
  });

  it('keeps an existing conversation and only removes the failed question', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const fake = fakeService({
      conversationReads: [ownConversation],
      chunks: [chunk('Relevant.')],
    });
    const { provider } = fakeProvider({ failWith: new Error('upstream exploded') });

    await collect(
      streamAnswer({
        service: fake.service,
        provider,
        assistant,
        conversation: { id: 'c1', channel: 'app' },
        message: 'Where is the palette?',
      }),
    );

    expect(fake.find('messages', 'delete')).toHaveLength(1);
    expect(fake.find('conversations', 'delete')).toHaveLength(0);
    expect(fake.rpcNames()).toEqual(['release_message']);
  });

  it('rolls back when the answer cannot be saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const fake = fakeService({
      conversationReads: [ownConversation],
      chunks: [chunk('Relevant.')],
      assistantInsertError: { code: '42501', message: 'permission denied for table messages' },
    });
    const { provider } = fakeProvider();

    const events = await collect(
      streamAnswer({
        service: fake.service,
        provider,
        assistant,
        conversation: { id: 'c1', channel: 'app' },
        message: 'Where is the palette?',
      }),
    );

    expect(events.at(-1)).toEqual({
      type: 'error',
      code: 'internal',
      message: 'The answer could not be saved.',
    });
    expect(fake.find('messages', 'delete')).toHaveLength(1);
    expect(fake.rpcNames()).toEqual(['release_message']);
  });
});

describe('streamAnswer stop', () => {
  const assistantInsert = (fake: ReturnType<typeof fakeService>) =>
    fake.find('messages', 'insert').find((call) => (call.payload as Row).role === 'assistant')
      ?.payload as Row | undefined;

  it('keeps the question and the text that arrived when the reader presses Stop', async () => {
    const fake = fakeService({ conversationReads: [null], chunks: [chunk('Relevant.')] });
    const { provider } = fakeProvider();
    const controller = new AbortController();
    const events: ChatStreamEvent[] = [];

    for await (const event of streamAnswer({
      service: fake.service,
      provider,
      assistant,
      conversation: { id: 'c-new', channel: 'app' },
      message: 'Where is the palette?',
      signal: controller.signal,
    })) {
      events.push(event);

      if (event.type === 'token') {
        controller.abort();
      }
    }

    const shown = tokenText(events).trim();

    expect(shown.length).toBeGreaterThan(0);
    expect(events.map((event) => event.type)).not.toContain('error');
    expect(fake.find('messages', 'delete')).toHaveLength(0);
    expect(fake.find('conversations', 'delete')).toHaveLength(0);
    expect(assistantInsert(fake)).toMatchObject({ content: shown, answered: null });
    expect(fake.rpcNames()).toEqual(['release_message']);
  });

  it('does the same when the transport stops pulling events', async () => {
    const fake = fakeService({
      conversationReads: [ownConversation],
      chunks: [chunk('Relevant.')],
    });
    const { provider } = fakeProvider();
    const events = streamAnswer({
      service: fake.service,
      provider,
      assistant,
      conversation: { id: 'c1', channel: 'app' },
      message: 'Where is the palette?',
    });
    const seen: ChatStreamEvent[] = [];

    while (true) {
      const next = await events.next();

      if (next.done) {
        break;
      }

      seen.push(next.value);

      if (next.value.type === 'token') {
        await events.return(undefined);
        break;
      }
    }

    expect(assistantInsert(fake)).toMatchObject({
      content: tokenText(seen).trim(),
      answered: null,
    });
    expect(fake.find('messages', 'delete')).toHaveLength(0);
    expect(fake.rpcNames()).toEqual(['release_message']);
  });

  it('saves the answer under the id the client proposed', async () => {
    const fake = fakeService({ conversationReads: [null], chunks: [chunk('Relevant.')] });
    const { provider } = fakeProvider();
    const events = await collect(
      streamAnswer({
        service: fake.service,
        provider,
        assistant,
        conversation: { id: 'c-new', channel: 'app' },
        message: 'Where is the palette?',
        assistantMessageId: 'proposed-id',
      }),
    );

    expect(events[0]).toMatchObject({ type: 'meta', assistantMessageId: 'proposed-id' });
    expect(assistantInsert(fake)).toMatchObject({ id: 'proposed-id', answered: true });
  });

  it('honours a recorded stop mid-answer though the request never aborts', async () => {
    let stop: Row | null = null;
    const fake = fakeService({
      conversationReads: [null],
      chunks: [chunk('Relevant.')],
      stop: () => stop,
    });
    const { provider } = fakeProvider({
      answer: Array.from({ length: 60 }, (_, index) => `word${index}`).join(' '),
      delayMs: 5,
    });
    const events: ChatStreamEvent[] = [];

    for await (const event of streamAnswer({
      service: fake.service,
      provider,
      assistant,
      conversation: { id: 'c-new', channel: 'app' },
      message: 'Where is the palette?',
      assistantMessageId: 'answer-1',
      stopPollMs: 10,
    })) {
      events.push(event);

      // The server has sent word3 by now, but the reader's screen only got as far as word2.
      if (event.type === 'token' && event.text.includes('word3') && !stop) {
        stop = { content: 'word0 word1 word2 ' };
      }
    }

    const reads = fake.find('message_stops', 'select');

    expect(reads[0]!.filters).toEqual({
      message_id: 'answer-1',
      conversation_id: 'c-new',
      assistant_id: 'a1',
    });
    // The model was cut off long before its sixtieth word, and nothing went out after the stop.
    expect(events.map((event) => event.type)).not.toContain('done');
    expect(tokenText(events)).not.toContain('word59');
    expect(tokenText(events)).toContain('word3');
    // What the reader saw, not what the server had sent.
    expect(assistantInsert(fake)).toMatchObject({
      id: 'answer-1',
      content: 'word0 word1 word2',
      answered: null,
    });
    expect(fake.find('messages', 'delete')).toHaveLength(0);
    expect(fake.rpcNames()).toEqual(['release_message']);
  });

  it('looks once more before saving, so a stop that just landed is not saved as an answer', async () => {
    let stop: Row | null = null;
    const fake = fakeService({
      conversationReads: [null],
      chunks: [chunk('Relevant.')],
      stop: () => stop,
    });
    const { provider } = fakeProvider();
    const events: ChatStreamEvent[] = [];

    for await (const event of streamAnswer({
      service: fake.service,
      provider,
      assistant,
      conversation: { id: 'c-new', channel: 'app' },
      message: 'Where is the palette?',
      // Only the first look and the one before saving happen within this answer.
      stopPollMs: 60_000,
    })) {
      events.push(event);

      if (event.type === 'token') {
        stop = { content: 'Pick the palette' };
      }
    }

    expect(events.map((event) => event.type)).not.toContain('done');
    expect(assistantInsert(fake)).toMatchObject({
      content: 'Pick the palette',
      answered: null,
      citations: [],
    });
    expect(fake.rpcNames()).toEqual(['release_message']);
  });

  it('applies a stop that lands between the last look and the save, after the reader has done', async () => {
    const answer =
      'Pick the palette mode in Settings, then choose a shortcut for opening it from any page. [1]';
    let saved = false;
    const fake = fakeService({
      conversationReads: [null],
      chunks: [chunk('Relevant.')],
      stop: () => (saved ? { content: 'Pick the palette mode' } : null),
      savedAnswer: {
        content: answer,
        citations: [{ index: 1, documentId: 'd1', title: 'Setup', url: null, snippet: 's' }],
        answered: true,
        owner_id: 'o1',
        created_at: new Date().toISOString(),
      },
    });
    const { provider } = fakeProvider({ answer });
    const events: ChatStreamEvent[] = [];

    for await (const event of streamAnswer({
      service: fake.service,
      provider,
      assistant,
      conversation: { id: 'c-new', channel: 'app' },
      message: 'Where is the palette?',
      assistantMessageId: 'answer-2',
      stopPollMs: 60_000,
    })) {
      events.push(event);
      saved ||= event.type === 'citations';
    }

    // The reader got the whole answer; the stop recorded meanwhile still wins in the database.
    expect(events.at(-1)).toMatchObject({ type: 'done', answered: true });
    expect(assistantInsert(fake)).toMatchObject({ id: 'answer-2', answered: true });

    const update = fake.find('messages', 'update')[0];

    expect(update?.payload).toEqual({
      content: 'Pick the palette mode',
      citations: [],
      answered: null,
    });
    expect(update?.filters).toMatchObject({ id: 'answer-2', 'answered not is': null });
    expect(fake.rpcNames()).toEqual(['release_message']);
  });

  it('keeps only the question when a stop was recorded before the answer started', async () => {
    const fake = fakeService({
      conversationReads: [null],
      chunks: [chunk('Relevant.')],
      stop: () => ({ content: '' }),
    });
    const { provider } = fakeProvider();

    const events = await collect(
      streamAnswer({
        service: fake.service,
        provider,
        assistant,
        conversation: { id: 'c-new', channel: 'app' },
        message: 'Where is the palette?',
      }),
    );

    expect(events.map((event) => event.type)).not.toContain('done');
    expect(fake.find('messages', 'insert').map((call) => (call.payload as Row).role)).toEqual([
      'user',
    ]);
    expect(fake.find('messages', 'delete')).toHaveLength(0);
    expect(fake.rpcNames()).toEqual(['release_message']);
  });

  it('keeps only the question when the reader stops before any text', async () => {
    const fake = fakeService({ conversationReads: [null], chunks: [chunk('Relevant.')] });
    const { provider } = fakeProvider();
    const controller = new AbortController();

    for await (const event of streamAnswer({
      service: fake.service,
      provider,
      assistant,
      conversation: { id: 'c-new', channel: 'app' },
      message: 'Where is the palette?',
      signal: controller.signal,
    })) {
      if (event.type === 'meta') {
        controller.abort();
      }
    }

    expect(fake.find('messages', 'insert').map((call) => (call.payload as Row).role)).toEqual([
      'user',
    ]);
    expect(fake.find('messages', 'delete')).toHaveLength(0);
    expect(fake.find('conversations', 'delete')).toHaveLength(0);
    expect(fake.rpcNames()).toEqual(['release_message']);
  });
});

describe('streamAnswer conversation race', () => {
  it('joins a conversation another request created a moment earlier', async () => {
    const fake = fakeService({
      conversationReads: [null, { ...ownConversation, id: 'c-new' }],
      conversationInsertError: { code: '23505', message: 'duplicate key value' },
      chunks: [chunk('Relevant.')],
    });
    const { provider } = fakeProvider();

    const events = await collect(
      streamAnswer({
        service: fake.service,
        provider,
        assistant,
        conversation: { id: 'c-new', channel: 'app' },
        message: 'Where is the palette?',
      }),
    );

    expect(events[0]).toMatchObject({ type: 'meta', conversationId: 'c-new' });
    expect(events.at(-1)).toMatchObject({ type: 'done', answered: true });
  });

  it('still refuses when the row that won belongs to someone else', async () => {
    const fake = fakeService({
      conversationReads: [null, { ...ownConversation, id: 'c-new', channel: 'widget' }],
      conversationInsertError: { code: '23505', message: 'duplicate key value' },
    });
    const { provider } = fakeProvider();

    const events = await collect(
      streamAnswer({
        service: fake.service,
        provider,
        assistant,
        conversation: { id: 'c-new', channel: 'app' },
        message: 'Where is the palette?',
      }),
    );

    expect(events).toEqual([{ type: 'error', code: 'not_found', message: expect.any(String) }]);
    expect(fake.find('messages', 'insert')).toHaveLength(0);
    expect(fake.rpcNames()).toEqual(['release_message']);
  });

  it('reports any other insert failure as a sentence', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const fake = fakeService({
      conversationReads: [null],
      conversationInsertError: { code: '42501', message: 'new row violates row-level security' },
    });
    const { provider } = fakeProvider();

    const events = await collect(
      streamAnswer({
        service: fake.service,
        provider,
        assistant,
        conversation: { id: 'c-new', channel: 'app' },
        message: 'Where is the palette?',
      }),
    );

    expect(events).toEqual([
      { type: 'error', code: 'internal', message: 'The conversation could not be started.' },
    ]);
    expect(fake.rpcNames()).toEqual(['release_message']);
  });
});

describe('streamAnswer unanswered', () => {
  it('meters an unanswered reply like any other answer', async () => {
    const fake = fakeService({ conversationReads: [ownConversation], chunks: [] });
    const { provider } = fakeProvider();

    const events = await collect(
      streamAnswer({
        service: fake.service,
        provider,
        assistant,
        conversation: { id: 'c1', channel: 'app' },
        message: 'Something the docs do not cover',
      }),
    );

    expect(tokenText(events)).toBe(UNANSWERED_TEXT);
    expect(events.at(-1)).toMatchObject({ type: 'done', answered: false });
    expect(fake.rpcNames()).toEqual([]);
  });
});
