import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReaderPages } from './reader-pages';

const ASSISTANT = 'asst-1';

describe('ReaderPages', () => {
  it('lists the busiest pages with their question count and answer rate', () => {
    render(
      <ReaderPages
        assistantId={ASSISTANT}
        pages={[
          {
            host: 'docs.acme.test',
            path: '/pricing',
            pageUrl: 'https://docs.acme.test/pricing?plan=pro#faq',
            questions: 5,
            answered: 4,
            unanswered: 1,
          },
          {
            host: 'docs.acme.test',
            path: '/api',
            pageUrl: 'https://docs.acme.test/api',
            questions: 3,
            answered: 1,
            unanswered: 2,
          },
          {
            host: '',
            path: '/',
            pageUrl: 'javascript:alert(1)',
            questions: 1,
            answered: 0,
            unanswered: 0,
          },
        ]}
        total={5}
      />,
    );

    expect(screen.getByTestId('section-count')).toHaveTextContent('5');

    const rows = screen.getAllByTestId('page-row');
    expect(rows).toHaveLength(3);

    expect(within(rows[0]!).getByRole('link', { name: '/pricing' })).toHaveAttribute(
      'href',
      'https://docs.acme.test/pricing?plan=pro#faq',
    );
    expect(rows[0]).toHaveTextContent('docs.acme.test');
    expect(within(rows[0]!).getByTestId('page-questions')).toHaveTextContent('5');
    expect(within(rows[0]!).getByTestId('page-rate')).toHaveTextContent('80%');
    expect(within(rows[0]!).getByTestId('page-rate')).not.toHaveTextContent('(low)');

    // One of three answered: flagged with an icon and a word, not colour alone.
    expect(within(rows[1]!).getByTestId('page-rate')).toHaveTextContent('33% (low)');

    // Only web addresses become links; nothing finished yet reads as a dash.
    expect(within(rows[2]!).queryByRole('link')).toBeNull();
    expect(within(rows[2]!).getByTestId('page-rate')).toHaveTextContent('–');

    expect(screen.getByText('2 more pages with fewer questions.')).toBeInTheDocument();
  });

  it('explains that it fills once the widget is installed', () => {
    render(<ReaderPages assistantId={ASSISTANT} pages={[]} total={0} />);

    expect(screen.getByText(/fills once the widget is on your docs site/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get the embed code' })).toHaveAttribute(
      'href',
      `/a/${ASSISTANT}/widget`,
    );
    expect(screen.queryByTestId('section-count')).toBeNull();
  });
});
