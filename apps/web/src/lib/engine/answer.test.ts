// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { type AiProvider, type GenerateChunk, type GenerateResult, ModelBusyError } from '@/lib/ai';

import { ANSWER_ERROR_COPY, streamAnswer } from './answer';
import type { ServiceClient } from './retrieval';

/**
 * Just enough of the supabase-js query builder for streamAnswer: every table call records what
 * was asked and resolves from the rows configured here, so the engine's decisions can be tested
 * without a database.
 */

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: unknown; filters: Record<string, unknown> };

type FakeOptions = {
  conversation?: Row | null;
  history?: Row[];
  chunks?: Row[];
  reserved?: boolean;
  conversationInsertError?: { code: string; message: string } | null;
};

const fakeService = (options: FakeOptions = {}) => {
  const calls: Call[] = [];
  const rpcCalls: { fn: string; args: Row }[] = [];
  let inserted = 0;

  const resolve = (call: Call) => {
    switch (`${call.table}/${call.op}`) {
      case 'conversations/select':
        return { data: options.conversation ?? null, error: null };
      case 'conversations/insert':
        return { data: null, error: options.conversationInsertError ?? null };
      case 'messages/select':
        return { data: options.history ?? [], error: null };
      case 'messages/insert':
        inserted += 1;

        return { data: { id: `m${inserted}` }, error: null };
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
        return Promise.resolve({ data: 1, error: null });
    }
  };

  return { service: { from, rpc } as unknown as ServiceClient, calls, rpcCalls };
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
};

/** Records the embedding queries it was asked for and answers with a fixed text. */
const fakeProvider = (options: ProviderOptions = {}) => {
  const embedded: string[] = [];
  const answer = options.answer ?? 'Pick the palette mode in Settings. [1]';

  const stream = async function* (): AsyncGenerator<GenerateChunk, GenerateResult> {
    if (options.failWith) {
      throw options.failWith;
    }

    for (const word of answer.split(' ')) {
      yield { text: `${word} ` };
    }

    return { model: 'fake', promptTokens: 1, completionTokens: 1 };
  };

  const provider: AiProvider = {
    name: 'fake',
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

const collect = async (events: AsyncGenerator<unknown>) => {
  const list: unknown[] = [];

  for await (const event of events) {
    list.push(event);
  }

  return list;
};

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
      conversation: {
        id: 'c1',
        assistant_id: 'a1',
        channel: 'app',
        visitor_id: null,
        title: 'Plans',
      },
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
      conversation: { id: 'c1', assistant_id: 'a1', channel: 'app', visitor_id: null, title: 'T' },
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

    const conversation = {
      id: 'c1',
      assistant_id: 'a1',
      channel: 'app',
      visitor_id: null,
      title: 'T',
    };
    const { service } = fakeService({ conversation, chunks: [chunk('Relevant.')] });
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
    const conversation = {
      id: 'c1',
      assistant_id: 'a1',
      channel: 'app',
      visitor_id: null,
      title: 'T',
    };
    const { service } = fakeService({ conversation, chunks: [chunk('Relevant.')] });
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
