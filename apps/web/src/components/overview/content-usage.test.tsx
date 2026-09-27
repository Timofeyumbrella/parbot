import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ContentUsage, type ContentUsageProps } from './content-usage';

const ASSISTANT = 'asst-1';
const NOW = Date.parse('2026-09-23T12:00:00Z');

const props = (overrides: Partial<ContentUsageProps> = {}): ContentUsageProps => ({
  assistantId: ASSISTANT,
  days: 30,
  cited: [
    {
      documentId: 'doc-auth',
      title: 'Authentication',
      url: 'https://docs.acme.test/auth',
      sourceTitle: 'docs.acme.test',
      sourceKind: 'url',
      answers: 12,
    },
    {
      documentId: 'doc-faq',
      title: 'FAQ',
      url: null,
      sourceTitle: 'FAQ',
      sourceKind: 'text',
      answers: 3,
    },
    {
      documentId: null,
      title: 'Old pricing',
      url: 'https://docs.acme.test/old-pricing',
      sourceTitle: null,
      sourceKind: null,
      answers: 1,
    },
  ],
  citedTotal: 3,
  uncited: [
    {
      documentId: 'doc-legacy',
      title: 'Legacy SDK',
      url: 'https://docs.acme.test/legacy',
      sourceTitle: 'docs.acme.test',
      sourceKind: 'url',
      createdAt: '2026-08-01T00:00:00Z',
    },
    {
      documentId: 'doc-manual',
      title: 'manual.pdf',
      url: null,
      sourceTitle: 'manual.pdf',
      sourceKind: 'upload',
      createdAt: '2026-09-22T12:00:00Z',
    },
  ],
  uncitedTotal: 7,
  indexed: 20,
  now: NOW,
  ...overrides,
});

describe('ContentUsage', () => {
  it('ranks cited pages with their source and links each to the page or to Knowledge', () => {
    render(<ContentUsage {...props()} />);

    const cited = screen.getByTestId('cited-documents');
    expect(cited).toHaveTextContent('Most cited: 3 pages used in answers');

    const rows = within(cited).getAllByTestId('cited-row');
    expect(rows.map((row) => within(row).getByTestId('cited-answers').textContent)).toEqual([
      '12 answers',
      '3 answers',
      '1 answer',
    ]);

    expect(within(rows[0]!).getByRole('link', { name: /Authentication/ })).toHaveAttribute(
      'href',
      'https://docs.acme.test/auth',
    );
    expect(rows[0]).toHaveTextContent('Website · docs.acme.test');
    // A pasted note has no address: its title leads to Knowledge.
    expect(within(rows[1]!).getByRole('link', { name: /FAQ/ })).toHaveAttribute(
      'href',
      `/a/${ASSISTANT}/knowledge`,
    );
    expect(rows[1]).toHaveTextContent('Pasted text · FAQ');
    expect(rows[2]).toHaveTextContent('No longer in Knowledge');
  });

  it('counts the pages no answer used out of all indexed ones and lists the oldest', () => {
    render(<ContentUsage {...props()} />);

    const uncited = screen.getByTestId('uncited-documents');
    expect(uncited).toHaveTextContent('Never cited: 7 of 20 indexed pages');

    const rows = within(uncited).getAllByTestId('uncited-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Legacy SDK');
    expect(rows[0]).toHaveTextContent('Added Aug 1, 2026');
    expect(rows[1]).toHaveTextContent('Upload · manual.pdf');
    expect(rows[1]).toHaveTextContent('Added yesterday');
    expect(within(uncited).getByText('and 5 more')).toBeInTheDocument();
  });

  it('says what each side means when it is empty', () => {
    render(
      <ContentUsage
        {...props({ cited: [], citedTotal: 0, uncited: [], uncitedTotal: 0, indexed: 4 })}
      />,
    );

    expect(screen.getByText('No answer cited a page in the last 30 days.')).toBeInTheDocument();
    expect(
      screen.getByText('Every indexed page was cited at least once in the last 30 days.'),
    ).toBeInTheDocument();
  });

  it('sends an assistant without pages to Knowledge', () => {
    render(
      <ContentUsage
        {...props({ cited: [], citedTotal: 0, uncited: [], uncitedTotal: 0, indexed: 0 })}
      />,
    );

    expect(screen.getByText('Nothing is indexed yet. Add a source in Knowledge.')).toBeVisible();
    expect(screen.getByRole('link', { name: /Review your sources in Knowledge/ })).toHaveAttribute(
      'href',
      `/a/${ASSISTANT}/knowledge`,
    );
  });
});
