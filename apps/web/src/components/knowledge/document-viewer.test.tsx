import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DocumentViewer, type ViewerDocument, type ViewerSource } from './document-viewer';

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));

const ASSISTANT = 'a1';

const upload: ViewerSource = {
  id: 's-upload',
  kind: 'upload',
  title: 'limits.md',
  uri: null,
  storage_path: 'o/a/file.md',
  mime_type: 'text/markdown',
  byte_size: 2048,
  document_count: 1,
};

const website: ViewerSource = {
  id: 's-site',
  kind: 'url',
  title: 'Acme docs',
  uri: 'https://docs.acme.test/',
  storage_path: null,
  mime_type: null,
  byte_size: null,
  document_count: 12,
};

const LIMITS = [
  '# Limits',
  '',
  'Every account starts on the free plan.',
  '',
  'Each workspace holds at most **five** projects.',
  '',
  '- Exports run once per day.',
  '',
  'Read [the billing guide](/billing) for upgrades.',
].join('\n');

const document = (patch: Partial<ViewerDocument> = {}): ViewerDocument => ({
  id: 'd1',
  title: 'limits.md',
  url: null,
  content: LIMITS,
  updated_at: new Date(Date.now() - 3 * 60_000).toISOString(),
  ...patch,
});

const view = (props: Partial<React.ComponentProps<typeof DocumentViewer>> = {}) =>
  render(
    <DocumentViewer assistantId={ASSISTANT} document={document()} source={upload} {...props} />,
  );

describe('DocumentViewer', () => {
  it('shows the page as Markdown, where it came from, and a way to the stored file', () => {
    view();

    expect(screen.getByRole('heading', { level: 1, name: 'limits.md' })).toBeInTheDocument();
    expect(screen.getByText(/Markdown file · 2\.0 KB/)).toBeInTheDocument();
    expect(screen.getByText(/indexed 3 min ago/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open file' })).toHaveAttribute(
      'href',
      '/api/sources/s-upload/file',
    );
    expect(screen.getByRole('link', { name: 'Open file' })).toHaveAttribute('target', '_blank');

    const article = screen.getByRole('article', { name: 'limits.md' });

    expect(within(article).getByRole('heading', { name: 'Limits' })).toBeInTheDocument();
    expect(within(article).getByText('five').tagName).toBe('STRONG');
    // A relative link in a file has nothing to resolve against, so it is text, not a link here.
    expect(within(article).queryByRole('link')).toBeNull();
    expect(within(article).getByText('the billing guide')).toBeInTheDocument();
    // Nothing was cited, so nothing is highlighted.
    expect(article.querySelector('[data-passage]')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('highlights the cited passage and marks where to scroll', () => {
    view({
      passage: {
        requested: true,
        content: 'Each workspace holds at most five projects.\n\n- Exports run once per day.',
      },
    });

    const marked = [...document_().querySelectorAll('[data-passage]')];

    expect(marked.map((node) => node.textContent)).toEqual([
      'Each workspace holds at most five projects.',
      'Exports run once per day.',
    ]);
    expect(marked[0]).toHaveAttribute('id', 'passage');
    expect(screen.getByRole('status')).toHaveTextContent(
      'The highlighted passage is the one the answer cited.',
    );
    expect(screen.getByRole('button', { name: 'Show passage' })).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('quotes the passage when the page no longer lays it out the same way', () => {
    view({ passage: { requested: true, content: 'A sentence this page does not contain.' } });

    expect(screen.getByTestId('cited-passage')).toHaveTextContent(
      'A sentence this page does not contain.',
    );
    expect(document_().querySelector('[data-passage]')).toBeNull();
  });

  it('says so and opens at the top when the passage is gone', () => {
    view({ passage: { requested: true, content: null } });

    expect(screen.getByRole('status')).toHaveTextContent(
      'The cited passage is no longer in this page: it was re-indexed after the answer.',
    );
  });

  it("links a web page to itself and resolves its links against the page's address", () => {
    view({
      source: website,
      document: document({
        title: 'Limits',
        url: 'https://docs.acme.test/guide/limits',
        content: 'See [billing](../billing) or [status](https://status.acme.test).',
      }),
    });

    expect(screen.getByRole('link', { name: 'Open page' })).toHaveAttribute(
      'href',
      'https://docs.acme.test/guide/limits',
    );
    expect(screen.getByRole('link', { name: 'billing' })).toHaveAttribute(
      'href',
      'https://docs.acme.test/billing',
    );
    expect(screen.getByRole('link', { name: 'status' })).toHaveAttribute(
      'href',
      'https://status.acme.test',
    );
    // A website's page names its site in the breadcrumb.
    expect(screen.getByRole('link', { name: 'Acme docs' })).toHaveAttribute(
      'href',
      '/a/a1/knowledge/sources/s-site',
    );
  });

  it('offers the original of pasted text and goes back to Knowledge', () => {
    view({ source: { ...upload, kind: 'text', title: 'Refund policy' } });

    expect(screen.getByRole('link', { name: 'Open original' })).toHaveAttribute(
      'href',
      '/api/sources/s-upload/file',
    );
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/a/a1/knowledge');
  });
});

/** The global document, named apart from the fixture above. */
const document_ = () => globalThis.document;
