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

  it('reads the markers of one page in ascending order, whatever order the answer cited them', () => {
    const cli = (index: number): Citation => ({
      index,
      documentId: 'd-cli',
      title: 'Zephyr CLI guide',
      url: 'https://docs.acme.test/cli',
      snippet: `Passage ${index}`,
    });

    render(<Sources citations={[cli(2), cli(1), cli(4), notes, cli(6)]} id="sources-m2" />);

    const link = within(screen.getByTestId('sources')).getByRole('link');

    expect(link).toHaveTextContent(/^1246Zephyr CLI guidedocs\.acme\.test$/);
    // Each snippet stays with its own marker.
    expect(link).toHaveAttribute('title', 'Passage 1\n\nPassage 2\n\nPassage 4\n\nPassage 6');
  });

  it('keeps citations without a document apart instead of merging them', () => {
    const loose = { index: 1, title: 'Loose', url: null, snippet: '' } as unknown as Citation;

    render(<Sources citations={[loose, { ...loose, index: 2, title: 'Other' }]} id="s" />);

    expect(screen.getByText('Loose')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });
});

describe('Sources for files', () => {
  const file = (index: number, chunkId?: string): Citation => ({
    index,
    documentId: 'd-limits',
    title: 'limits.md',
    url: null,
    snippet: `Passage ${index}`,
    ...(chunkId ? { chunkId } : {}),
  });

  it('opens a file in the viewer at the passage of its lowest marker', () => {
    render(<Sources citations={[file(3, 'c3'), file(1, 'c1')]} id="s" assistantId="asst" />);

    const link = within(screen.getByTestId('sources')).getByRole('link', { name: /limits\.md/ });

    expect(link).toHaveAttribute('href', '/a/asst/knowledge/documents/d-limits?passage=c1');
    expect(link).not.toHaveAttribute('target');
    expect(link).toHaveTextContent(/^13limits\.md$/);
  });

  it('opens an answer saved before passages were recorded at the top of the page', () => {
    render(<Sources citations={[file(2)]} id="s" assistantId="asst" />);

    expect(screen.getByRole('link', { name: /limits\.md/ })).toHaveAttribute(
      'href',
      '/a/asst/knowledge/documents/d-limits',
    );
  });

  it('points each inline marker at its own passage', () => {
    const { container } = render(
      <AnswerMarkdown
        content="Five projects [1]. Daily exports [3]."
        citations={[file(1, 'c1'), file(3, 'c3')]}
        sourcesId="sources-m1"
        assistantId="asst"
      />,
    );

    const markers = [...container.querySelectorAll('sup[data-citation] a')];

    expect(markers.map((marker) => marker.getAttribute('href'))).toEqual([
      '/a/asst/knowledge/documents/d-limits?passage=c1',
      '/a/asst/knowledge/documents/d-limits?passage=c3',
    ]);
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
