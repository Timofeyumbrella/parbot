import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { firstLine } from '@/lib/overview';

import { DislikedAnswers } from './disliked-answers';

const ASSISTANT = 'asst-1';
const NOW = Date.parse('2026-09-23T12:00:00Z');

describe('DislikedAnswers', () => {
  it('lists each disliked answer with its question, first line and a link to it', () => {
    render(
      <DislikedAnswers
        assistantId={ASSISTANT}
        answers={[
          {
            messageId: 'msg-2',
            conversationId: 'conv-2',
            answeredAt: '2026-09-23T10:00:00Z',
            question: 'Do you support JavaScript-rendered docs sites?',
            preview: firstLine(
              'Not for crawling: pages that render with **JavaScript** come back empty [1].\n\nMore.',
            ),
          },
          {
            messageId: 'msg-1',
            conversationId: 'conv-1',
            answeredAt: '2026-09-20T10:00:00Z',
            question: null,
            preview: '',
          },
        ]}
        total={4}
        now={NOW}
      />,
    );

    expect(screen.getByTestId('section-count')).toHaveTextContent('4');

    const rows = screen.getAllByTestId('disliked-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Do you support JavaScript-rendered docs sites?');
    expect(rows[0]).toHaveTextContent(
      'Not for crawling: pages that render with JavaScript come back empty.',
    );
    expect(within(rows[0]!).getByRole('time')).toHaveTextContent('2 hr ago');
    // Straight to the answer in its transcript.
    expect(rows[0]).toHaveAttribute('href', `/a/${ASSISTANT}/inbox/conv-2#message-msg-2`);

    expect(rows[1]).toHaveTextContent('Question not found');
    expect(screen.getByText('2 older in this period.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Fix the page, then re-index its source/ }),
    ).toHaveAttribute('href', `/a/${ASSISTANT}/knowledge`);
  });

  it('explains how ratings arrive when there are none', () => {
    render(<DislikedAnswers assistantId={ASSISTANT} answers={[]} total={0} now={NOW} />);

    expect(screen.getByText(/No thumbs down in this period/)).toBeInTheDocument();
    expect(screen.queryByTestId('disliked-row')).toBeNull();
  });
});
