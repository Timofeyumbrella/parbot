import { type ChatStreamEvent, encodeSseEvent, type WidgetChatRequest } from '@parbot/shared';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveDemo } from './live-demo';

const sse = (events: ChatStreamEvent[]) =>
  new Response(events.map(encodeSseEvent).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const CONFIG = {
  name: 'Acme Docs',
  welcomeMessage: 'Ask about the Acme API.',
  suggestedQuestions: ['How do I rotate a key?', 'Do webhooks retry?'],
};

describe('LiveDemo', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('loads the assistant config and streams a cited answer through the widget endpoint', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith('/api/widget/config')) {
        expect(url).toBe('/api/widget/config?key=pb_demo');

        return json(CONFIG);
      }

      return sse([
        { type: 'meta', conversationId: 'c', userMessageId: 'u', assistantMessageId: 'a' },
        { type: 'token', text: 'Open Settings, then ' },
        { type: 'token', text: 'API keys [1].' },
        {
          type: 'citations',
          citations: [
            {
              index: 1,
              documentId: 'd',
              title: 'Authentication › API keys',
              url: 'https://docs.acme.dev/auth',
              snippet: '',
            },
          ],
        },
        { type: 'done', answered: true, latencyMs: 12 },
      ]);
    });

    const user = userEvent.setup();

    render(<LiveDemo demoKey="pb_demo" />);

    expect(await screen.findByText('Ask about the Acme API.')).toBeInTheDocument();
    expect(screen.getByText('Acme Docs')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'How do I rotate a key?' }));

    expect(
      await screen.findByText('Open Settings, then API keys', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('How do I rotate a key?')).toBeInTheDocument();

    const chip = await screen.findByRole('link', { name: '1' });

    expect(chip).toHaveAttribute('href', 'https://docs.acme.dev/auth');
    expect(screen.getByRole('list', { name: 'Sources' })).toHaveTextContent(
      'Authentication › API keys',
    );

    const chatCall = fetchMock.mock.calls.find(([input]) => String(input) === '/api/widget/chat');

    expect(chatCall).toBeDefined();

    const body = JSON.parse((chatCall![1] as RequestInit).body as string) as WidgetChatRequest;

    expect(body.key).toBe('pb_demo');
    expect(body.message).toBe('How do I rotate a key?');
    expect(body.visitorId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(body.conversationId).toMatch(/^[0-9a-f-]{36}$/);

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Ask a question' })).toBeEnabled(),
    );
  });

  it('lists each cited page once with its markers, in ascending order', async () => {
    const citation = (index: number, documentId: string, title: string) => ({
      index,
      documentId,
      title,
      url: `https://docs.acme.dev/${documentId}`,
      snippet: '',
    });

    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).startsWith('/api/widget/config')
        ? json(CONFIG)
        : sse([
            { type: 'token', text: 'Paste the tag [2]. Set the key [3]. Reload [1].' },
            {
              type: 'citations',
              citations: [
                citation(2, 'install', 'Installing the widget'),
                citation(3, 'keys', 'Public keys'),
                citation(1, 'install', 'Installing the widget'),
              ],
            },
            { type: 'done', answered: true, latencyMs: 5 },
          ]),
    );

    const user = userEvent.setup();

    render(<LiveDemo demoKey="pb_demo" />);

    await user.type(
      await screen.findByRole('textbox', { name: 'Ask a question' }),
      'How do I install it?{Enter}',
    );

    const sources = await screen.findByRole('list', { name: 'Sources' });
    const chips = within(sources).getAllByRole('listitem');

    expect(chips.map((chip) => chip.textContent)).toEqual([
      '12Installing the widget',
      '3Public keys',
    ]);
    expect(within(chips[0]!).getByRole('link')).toHaveAttribute(
      'href',
      'https://docs.acme.dev/install',
    );
  });

  it('keeps the same conversation across questions typed into the form', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).startsWith('/api/widget/config')
        ? json(CONFIG)
        : sse([
            { type: 'token', text: 'Yes.' },
            { type: 'done', answered: true, latencyMs: 5 },
          ]),
    );

    const user = userEvent.setup();

    render(<LiveDemo demoKey="pb_demo" />);

    const input = await screen.findByRole('textbox', { name: 'Ask a question' });

    await user.type(input, 'First question{Enter}');
    await screen.findByText('Yes.');
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, 'Second question{Enter}');
    await waitFor(() => expect(screen.getAllByText('Yes.')).toHaveLength(2));

    const bodies = fetchMock.mock.calls
      .filter(([request]) => String(request) === '/api/widget/chat')
      .map(([, init]) => JSON.parse((init as RequestInit).body as string) as WidgetChatRequest);

    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.conversationId).toBe(bodies[1]?.conversationId);
    expect(bodies[0]?.visitorId).toBe(bodies[1]?.visitorId);
  });

  it('shows the server message and a retry when the endpoint refuses', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).startsWith('/api/widget/config')
        ? json(CONFIG)
        : json(
            { code: 'rate_limited', message: 'Too many questions. Try again in a minute.' },
            429,
          ),
    );

    const user = userEvent.setup();

    render(<LiveDemo demoKey="pb_demo" />);

    await user.type(
      await screen.findByRole('textbox', { name: 'Ask a question' }),
      'Anything{Enter}',
    );

    expect(
      await screen.findByText('Too many questions. Try again in a minute.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('falls back to the default copy and says when the assistant is unreachable', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).startsWith('/api/widget/config')) {
        return json({ error: 'not_found' }, 404);
      }

      throw new TypeError('Failed to fetch');
    });

    const user = userEvent.setup();

    render(<LiveDemo demoKey="pb_demo" />);

    expect(await screen.findByText('Ask anything about the documentation.')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Ask a question' }), 'Anything{Enter}');

    expect(await screen.findByText(/could not reach the assistant/i)).toBeInTheDocument();
  });
});
