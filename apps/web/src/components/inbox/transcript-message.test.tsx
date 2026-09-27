import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MessageBubble } from '@/components/chat/message-bubble';

import { parseCitations, TranscriptMessage } from './transcript-message';

const NOW = new Date('2026-09-23T12:00:00Z').getTime();

const base = {
  id: 'm1',
  role: 'assistant' as const,
  content:
    'Create the key in **Settings** [1]. Rotate it monthly [2]. Scopes limit it [4].\n\n```bash\nparbot keys create\n```',
  citations: [
    {
      index: 1,
      documentId: 'd1',
      title: 'Authentication',
      url: 'https://docs.example.com/auth',
      snippet: 'API keys…',
    },
    { index: 2, documentId: 'd2', title: 'Offline doc', url: null, snippet: 'No link' },
    {
      index: 4,
      documentId: 'd1',
      title: 'Authentication',
      url: 'https://docs.example.com/auth',
      snippet: 'Scopes…',
    },
  ],
  answered: true,
  feedback: null,
  created_at: '2026-09-23T11:55:00Z',
};

describe('TranscriptMessage', () => {
  it('renders markdown, citation chips, the sources row and the time', () => {
    const { container } = render(<TranscriptMessage assistantId="asst" message={base} now={NOW} />);

    expect(screen.getByText('Settings').tagName).toBe('STRONG');
    expect(screen.getByText('parbot keys create').closest('pre')).not.toBeNull();

    // Every marker is a chip, 4 included although only three passages were cited.
    const chips = [...container.querySelectorAll('sup[data-citation] a')];

    expect(chips.map((chip) => chip.textContent)).toEqual(['1', '2', '4']);
    expect(chips[0]).toHaveAttribute('href', 'https://docs.example.com/auth');
    // A file has no page of its own: its marker opens it in the document viewer.
    expect(chips[1]).toHaveAttribute('href', '/a/asst/knowledge/documents/d2');

    // One chip per page; a web page opens itself, a file opens in the viewer.
    const sources = screen.getByTestId('sources');

    expect(sources).toHaveAttribute('id', 'sources-m1');
    expect(within(sources).getByRole('link', { name: /Authentication/ })).toHaveAttribute(
      'href',
      'https://docs.example.com/auth',
    );
    expect(within(sources).getAllByText('Authentication')).toHaveLength(1);
    expect(within(sources).getByRole('link', { name: /Offline doc/ })).toHaveAttribute(
      'href',
      '/a/asst/knowledge/documents/d2',
    );
    expect(screen.getByText('5 min ago')).toBeInTheDocument();
    expect(screen.queryByText('Unanswered')).toBeNull();
  });

  it('shows an answer exactly as the chat does', () => {
    const transcript = render(<TranscriptMessage assistantId="asst" message={base} now={NOW} />);
    const transcriptSources = transcript.getByTestId('sources').outerHTML;
    const transcriptAnswer = transcript.container.querySelector('.answer-prose')!.outerHTML;

    transcript.unmount();

    const chat = render(
      <MessageBubble
        message={{
          ...base,
          citations: parseCitations(base.citations),
          latency_ms: null,
          status: 'complete',
        }}
        assistantId="asst"
        assistantName="Acme Docs"
      />,
    );

    expect(chat.getByTestId('sources').outerHTML).toBe(transcriptSources);
    expect(chat.container.querySelector('.answer-prose')!.outerHTML).toBe(transcriptAnswer);
  });

  it('marks unanswered answers and shows feedback as an indicator', () => {
    render(
      <TranscriptMessage
        assistantId="asst"
        message={{
          ...base,
          content: 'I could not find that.',
          citations: [],
          answered: false,
          feedback: -1,
        }}
        now={NOW}
      />,
    );

    expect(screen.getByText('Unanswered')).toBeInTheDocument();
    expect(screen.getByText('Not helpful')).toBeInTheDocument();
    expect(screen.queryByTestId('sources')).toBeNull();
  });

  it('shows helpful feedback and keeps user messages as plain text', () => {
    render(
      <TranscriptMessage
        assistantId="asst"
        message={{
          ...base,
          role: 'user',
          content: '**not markdown** [1]',
          citations: [],
          answered: null,
          feedback: 1,
        }}
        now={NOW}
      />,
    );

    expect(screen.getByText('**not markdown** [1]')).toBeInTheDocument();
    expect(screen.getByLabelText('Visitor message')).toBeInTheDocument();
    expect(screen.getByText('Helpful')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('can be linked to by its id, which the Overview uses for disliked answers', () => {
    render(<TranscriptMessage assistantId="asst" message={base} now={NOW} />);

    expect(screen.getByLabelText('Assistant message')).toHaveAttribute('id', `message-${base.id}`);
  });
});

describe('parseCitations', () => {
  it('drops malformed payloads and fills what older rows left out', () => {
    expect(parseCitations(null)).toEqual([]);
    expect(parseCitations('nope')).toEqual([]);
    expect(parseCitations([{ index: 'x' }])).toEqual([]);
    expect(parseCitations([{ index: 1, documentId: 'd', title: 'T' }])).toEqual([
      { index: 1, documentId: 'd', title: 'T', url: null, snippet: '' },
    ]);
  });

  it('shows the files an in-app question pointed at, each opening its text', () => {
    render(
      <TranscriptMessage
        assistantId="asst"
        message={{
          ...base,
          id: 'u1',
          role: 'user',
          content: 'What does this say about limits?',
          citations: [],
          source_references: [{ id: 's1', title: 'limits.md', kind: 'upload' }],
        }}
        now={NOW}
      />,
    );

    expect(
      within(screen.getByRole('list', { name: 'Referenced files' })).getByRole('link', {
        name: 'limits.md',
      }),
    ).toHaveAttribute('href', '/a/asst/knowledge/sources/s1');
  });
});
