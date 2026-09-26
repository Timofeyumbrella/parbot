import type { Citation } from '@parbot/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AnswerMarkdown } from './answer-markdown';
import { Sources } from './sources';

const auth = (index: number, snippet: string): Citation => ({
  index,
  documentId: 'd-auth',
  title: 'Authentication',
  url: 'https://docs.acme.test/auth',
  snippet,
});

const notes: Citation = {
  index: 3,
  documentId: 'd-notes',
  title: 'Pasted notes',
  url: null,
  snippet: 'Rotate keys monthly.',
};

describe('Sources', () => {
  it('lists a page once with every marker that cites it, in the order the answer first cites it', () => {
    render(
      <Sources
        citations={[auth(2, 'Keys live in Settings.'), notes, auth(5, 'Keys carry scopes.')]}
        id="sources-m1"
      />,
    );

    const row = screen.getByTestId('sources');

    expect(row).toHaveAttribute('id', 'sources-m1');
    expect(within(row).getAllByText('Authentication')).toHaveLength(1);

    const link = within(row).getByRole('link');

    expect(link).toHaveAttribute('href', 'https://docs.acme.test/auth');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveTextContent(/^25Authenticationdocs\.acme\.test$/);
    expect(link).toHaveAttribute('title', 'Keys live in Settings.\n\nKeys carry scopes.');

    const unlinked = within(row).getByText('Pasted notes').parentElement!;

    expect(unlinked.tagName).toBe('SPAN');
    expect(unlinked).toHaveTextContent(/^3Pasted notes$/);
    expect(unlinked).toHaveAttribute('title', 'Rotate keys monthly.');
    // Authentication is cited first, so it comes first.
    expect(row.textContent).toMatch(/Authentication.*Pasted notes/);
  });

  it('numbers the markers of a page in ascending order whatever order the answer cites them', () => {
    render(<Sources citations={[auth(5, 'Scopes.'), auth(2, 'Settings.')]} id="s" />);

    const link = within(screen.getByTestId('sources')).getByRole('link');

    expect(link).toHaveTextContent(/^25Authentication/);
    expect(link).toHaveAttribute('title', 'Settings.\n\nScopes.');
  });

  it('keeps citations without a document apart instead of merging them', () => {
    const loose = { index: 1, title: 'Loose', url: null, snippet: '' } as unknown as Citation;

    render(<Sources citations={[loose, { ...loose, index: 2, title: 'Other' }]} id="s" />);

    expect(screen.getByText('Loose')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });
});

describe('AnswerMarkdown citation markers', () => {
  it('turns every cited marker into a chip when the cited indexes skip some', () => {
    const { container } = render(
      <AnswerMarkdown
        content="In Settings [2]. Monthly [3]. Scoped [5]. Nothing retrieved [9]."
        citations={[auth(2, ''), notes, auth(5, '')]}
        sourcesId="sources-m1"
      />,
    );

    const chips = [...container.querySelectorAll('sup[data-citation]')];

    expect(chips.map((chip) => chip.textContent)).toEqual(['2', '3', '5']);
    expect(chips[2]!.querySelector('a')).toHaveAttribute('href', 'https://docs.acme.test/auth');
    expect(chips[1]!.querySelector('a')).toHaveAttribute('href', '#sources-m1');
    // A marker past every citation points at nothing and stays as written.
    expect(container).toHaveTextContent('Nothing retrieved [9].');
  });
});
