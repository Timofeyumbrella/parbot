import type { Citation } from '@parbot/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ThreadMessage } from '@/lib/chat/thread';

import { MessageBubble } from './message-bubble';

const citations: Citation[] = [
  {
    index: 1,
    documentId: 'd1',
    title: 'Authentication',
    url: 'https://docs.acme.test/auth',
    snippet: 'API keys are created in Settings.',
  },
  { index: 2, documentId: 'd2', title: 'Pasted notes', url: null, snippet: 'Rotate keys monthly.' },
];

const message = (overrides: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id: 'a1',
  role: 'assistant',
  content: 'Rotate the key in **Settings** [1]. Keep the old one for an hour [2].',
  citations,
  answered: true,
  feedback: null,
  created_at: '2026-09-23T10:00:00.000Z',
  latency_ms: 820,
  status: 'complete',
  ...overrides,
});

const renderBubble = (props: Partial<React.ComponentProps<typeof MessageBubble>> = {}) =>
  render(
    <MessageBubble message={message()} assistantId="asst" assistantName="Acme Docs" {...props} />,
  );

describe('MessageBubble for the reader', () => {
  it('sits on the right, keeps line breaks and reports a failed send', () => {
    const { container } = renderBubble({
      message: message({ id: 'u1', role: 'user', content: 'first line\nsecond line', status: 'failed' }),
    });

    const bubble = container.querySelector('[data-role="user"]');

    expect(bubble).toHaveClass('items-end');
    expect(bubble).toHaveAttribute('data-status', 'failed');
    expect(screen.getByText(/first line/)).toHaveClass('whitespace-pre-wrap');
    expect(screen.getByText('Not sent')).toBeInTheDocument();
  });
});

describe('MessageBubble for the assistant', () => {
  it('shows the name, renders markdown and turns [n] markers into chips', () => {
    const { container } = renderBubble();

    expect(screen.getByText('Acme Docs')).toBeInTheDocument();
    expect(screen.getByText('Settings').tagName).toBe('STRONG');

    const chips = container.querySelectorAll('sup[data-citation] a');

    expect(chips).toHaveLength(2);
    expect(chips[0]).toHaveAttribute('href', 'https://docs.acme.test/auth');
    expect(chips[0]).toHaveAttribute('target', '_blank');
    // A source without a url points at the sources row instead.
    expect(chips[1]).toHaveAttribute('href', '#sources-a1');
    expect(chips[1]).not.toHaveAttribute('target');
  });

  it('lists the sources with their hostnames', () => {
    renderBubble();

    const sources = screen.getByTestId('sources');

    expect(sources).toHaveAttribute('id', 'sources-a1');
    expect(within(sources).getByRole('link', { name: /Authentication/ })).toHaveAttribute(
      'href',
      'https://docs.acme.test/auth',
    );
    expect(within(sources).getByText('docs.acme.test')).toBeInTheDocument();
    expect(within(sources).getByText('Pasted notes')).toBeInTheDocument();
    expect(within(sources).queryByRole('link', { name: /Pasted notes/ })).not.toBeInTheDocument();
  });

  it('renders fenced code with a language label and a copy button', async () => {
    const user = userEvent.setup();

    renderBubble({
      message: message({
        content: 'Run this:\n\n```bash\nacme keys rotate --id 42\n```\n',
        citations: [],
      }),
    });

    const block = screen.getByTestId('code-block');

    expect(within(block).getByText('bash')).toBeInTheDocument();
    expect(block.querySelector('pre code')).toHaveTextContent('acme keys rotate --id 42');

    await user.click(within(block).getByRole('button', { name: 'Copy' }));

    // user-event installs its own clipboard, which the copy button writes into.
    expect(await navigator.clipboard.readText()).toBe('acme keys rotate --id 42');
    expect(within(block).getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('renders GFM tables and lists', () => {
    renderBubble({
      message: message({
        content: '| Plan | Pages |\n| --- | --- |\n| Hobby | 100 |\n\n- one\n- two\n',
        citations: [],
      }),
    });

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '100' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows latency and sends feedback, toggling a repeated vote off', async () => {
    const user = userEvent.setup();
    const onFeedback = vi.fn();

    renderBubble({ onFeedback });

    expect(screen.getByText('0.8s')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Good answer' }));
    expect(onFeedback).toHaveBeenCalledWith('a1', 1);

    renderBubble({ onFeedback, message: message({ id: 'a2', feedback: 1 }) });

    const [, second] = screen.getAllByRole('button', { name: 'Good answer' });

    expect(second).toHaveAttribute('aria-pressed', 'true');
    await user.click(second!);
    expect(onFeedback).toHaveBeenLastCalledWith('a2', null);

    await user.click(screen.getAllByRole('button', { name: 'Poor answer' })[1]!);
    expect(onFeedback).toHaveBeenLastCalledWith('a2', -1);
  });

  it('mutes an unanswered message and points at Knowledge', () => {
    renderBubble({ message: message({ answered: false, citations: [], content: 'I could not find that.' }) });

    expect(screen.getByText('I could not find that.').closest('.answer-prose')).toHaveClass('text-muted-foreground');
    expect(screen.getByRole('link', { name: /Add docs that cover this in Knowledge/ })).toHaveAttribute(
      'href',
      '/a/asst/knowledge',
    );
  });

  it('shows a thinking indicator, then the caret on the last text while streaming', () => {
    const { container, rerender } = renderBubble({
      message: message({ content: '', citations: [], status: 'streaming', latency_ms: null }),
    });

    expect(screen.getByRole('status', { name: 'Thinking' })).toBeInTheDocument();

    rerender(
      <MessageBubble
        message={message({ content: 'Half an answer', citations: [], status: 'streaming', latency_ms: null })}
        assistantId="asst"
        assistantName="Acme Docs"
      />,
    );

    expect(container.querySelector('.streaming-caret')).toHaveTextContent('Half an answer');
    expect(screen.queryByRole('button', { name: 'Good answer' })).not.toBeInTheDocument();
  });

  it('shows the error and offers a retry for the question it answers', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    renderBubble({
      onRetry,
      questionId: 'u1',
      message: message({
        content: '',
        citations: [],
        status: 'error',
        error: { code: 'rate_limited', message: 'You are sending messages quickly.' },
      }),
    });

    expect(screen.getByRole('alert')).toHaveTextContent('You are sending messages quickly.');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledWith('u1');
  });

  it('labels a stopped answer and keeps its partial text', () => {
    renderBubble({ message: message({ content: 'Partial', citations: [], status: 'stopped', latency_ms: null }) });

    expect(screen.getByText('Partial')).toBeInTheDocument();
    expect(screen.getByText('Stopped')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Good answer' })).not.toBeInTheDocument();
  });
});
