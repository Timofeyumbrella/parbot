import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { groupGaps } from '@/lib/overview';

import { addDocsHref, KnowledgeGaps } from './knowledge-gaps';

const ASSISTANT = 'asst-1';
const NOW = Date.parse('2026-09-23T12:00:00Z');

const gaps = groupGaps([
  {
    question: 'Is there a Slack integration?',
    asks: 3,
    lastAskedAt: '2026-09-21T12:00:00Z',
    conversationId: 'conv-slack-1',
  },
  {
    question: 'Do you have a Slack integration',
    asks: 1,
    lastAskedAt: '2026-09-23T11:00:00Z',
    conversationId: 'conv-slack-2',
  },
  {
    question: 'slack integration?',
    asks: 1,
    lastAskedAt: '2026-09-20T11:00:00Z',
    conversationId: 'conv-slack-3',
  },
  {
    question: 'Can I export conversations to CSV?',
    asks: 1,
    lastAskedAt: '2026-09-01T11:00:00Z',
    conversationId: 'conv-csv',
  },
]);

describe('KnowledgeGaps', () => {
  it('lists grouped gaps with their counts, last ask, wordings and conversation', () => {
    render(<KnowledgeGaps assistantId={ASSISTANT} gaps={gaps} total={gaps.length} now={NOW} />);

    const section = screen.getByRole('region', { name: /Knowledge gaps/ });
    expect(within(section).getByTestId('section-count')).toHaveTextContent('2');

    const rows = screen.getAllByTestId('gap-row');
    expect(rows).toHaveLength(2);

    expect(rows[0]).toHaveTextContent('Is there a Slack integration?');
    expect(within(rows[0]!).getByTestId('gap-asks')).toHaveTextContent('5 times');
    expect(rows[0]).toHaveTextContent('Also asked as “Do you have a Slack integration” and 1 more');
    expect(within(rows[0]!).getByRole('time')).toHaveTextContent('1 hr ago');
    // The conversation the gap was most recently asked in.
    expect(rows[0]).toHaveAttribute('href', `/a/${ASSISTANT}/inbox/conv-slack-2`);

    expect(within(rows[1]!).getByTestId('gap-asks')).toHaveTextContent('1 time');
    expect(within(rows[1]!).getByRole('time')).toHaveTextContent('Sep 1, 2026');
  });

  it('offers Add docs, which opens the Add source dialog in Knowledge', () => {
    render(<KnowledgeGaps assistantId={ASSISTANT} gaps={gaps} total={gaps.length} now={NOW} />);

    expect(screen.getByRole('link', { name: 'Add docs' })).toHaveAttribute(
      'href',
      addDocsHref(ASSISTANT),
    );
    expect(addDocsHref(ASSISTANT)).toBe(`/a/${ASSISTANT}/knowledge?add=url`);
  });

  it('points to the Inbox for the gaps beyond the list', () => {
    render(<KnowledgeGaps assistantId={ASSISTANT} gaps={gaps.slice(0, 1)} total={9} now={NOW} />);

    expect(screen.getByRole('link', { name: /8 more in the Inbox/ })).toHaveAttribute(
      'href',
      `/a/${ASSISTANT}/inbox?filter=unanswered`,
    );
  });

  it('says so when nothing went unanswered', () => {
    render(<KnowledgeGaps assistantId={ASSISTANT} gaps={[]} total={0} now={NOW} />);

    expect(screen.getByText(/No unanswered questions in this period/)).toBeInTheDocument();
    expect(screen.queryByTestId('gap-row')).toBeNull();
    // Adding docs is still one click away.
    expect(screen.getByRole('link', { name: 'Add docs' })).toBeInTheDocument();
  });
});
