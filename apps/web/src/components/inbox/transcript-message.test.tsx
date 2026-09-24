import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { linkCitations, parseCitations, TranscriptMessage } from './transcript-message';

const NOW = new Date('2026-09-23T12:00:00Z').getTime();

const base = {
  id: 'm1',
  role: 'assistant' as const,
  content: 'Create the key in **Settings** [1].\n\n```bash\nparbot keys create\n```',
  citations: [
    { index: 1, documentId: 'd1', title: 'Authentication', url: 'https://docs.example.com/auth', snippet: 'API keys…' },
    { index: 2, documentId: 'd2', title: 'Offline doc', url: null, snippet: 'No link' },
  ],
  answered: true,
  feedback: null,
  created_at: '2026-09-23T11:55:00Z',
};

describe('TranscriptMessage', () => {
  it('renders markdown, citation chips, a sources list and the time', () => {
    render(<TranscriptMessage message={base} now={NOW} />);

    expect(screen.getByText('Settings').tagName).toBe('STRONG');
    expect(screen.getByText('parbot keys create').closest('pre')).not.toBeNull();
    expect(screen.getByText('Sources')).toBeInTheDocument();

    const chip = screen.getByRole('link', { name: 'Source 1' });
    expect(chip).toHaveAttribute('href', '#cite-m1-1');
    expect(document.getElementById('cite-m1-1')).not.toBeNull();

    const link = screen.getByRole('link', { name: 'Authentication' });
    expect(link).toHaveAttribute('href', 'https://docs.example.com/auth');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Offline doc').tagName).toBe('SPAN');
    expect(screen.getByText('5 min ago')).toBeInTheDocument();
    expect(screen.queryByText('Unanswered')).toBeNull();
  });

  it('marks unanswered answers and shows feedback as an indicator', () => {
    render(
      <TranscriptMessage
        message={{ ...base, content: 'I could not find that.', citations: [], answered: false, feedback: -1 }}
        now={NOW}
      />,
    );

    expect(screen.getByText('Unanswered')).toBeInTheDocument();
    expect(screen.getByText('Not helpful')).toBeInTheDocument();
    expect(screen.queryByText('Sources')).toBeNull();
  });

  it('shows helpful feedback and keeps user messages as plain text', () => {
    render(
      <TranscriptMessage
        message={{ ...base, role: 'user', content: '**not markdown** [1]', citations: [], answered: null, feedback: 1 }}
        now={NOW}
      />,
    );

    expect(screen.getByText('**not markdown** [1]')).toBeInTheDocument();
    expect(screen.getByLabelText('Visitor message')).toBeInTheDocument();
    expect(screen.getByText('Helpful')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('linkCitations', () => {
  const citations = [{ index: 1, documentId: 'd1', title: 'A' }];

  it('links known markers, leaves unknown ones and existing links alone', () => {
    expect(linkCitations('See [1] and [2].', 'm', citations)).toBe('See [1](#cite-m-1) and [2].');
    expect(linkCitations('A [1](https://x.y) link', 'm', citations)).toBe('A [1](https://x.y) link');
    expect(linkCitations('Nothing to cite [1]', 'm', [])).toBe('Nothing to cite [1]');
  });
});

describe('parseCitations', () => {
  it('drops malformed payloads instead of rendering them broken', () => {
    expect(parseCitations(null)).toEqual([]);
    expect(parseCitations('nope')).toEqual([]);
    expect(parseCitations([{ index: 'x' }])).toEqual([]);
    expect(parseCitations([{ index: 1, documentId: 'd', title: 'T' }])).toEqual([{ index: 1, documentId: 'd', title: 'T' }]);
  });
});
