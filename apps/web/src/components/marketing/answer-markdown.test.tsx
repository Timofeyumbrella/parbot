import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AnswerMarkdown, linkCitationMarkers } from './answer-markdown';

afterEach(cleanup);

describe('linkCitationMarkers', () => {
  it('turns [n] and [n, m] into cite links', () => {
    expect(linkCitationMarkers('Rotate the key [1]. Old keys expire [1, 2].')).toBe(
      'Rotate the key [1](#cite-1). Old keys expire [1](#cite-1)[2](#cite-2).',
    );
  });

  it('leaves markers inside code spans and fences alone', () => {
    const text = 'Use `items[1]` and\n```js\nconst first = list[2];\n```\nthen see [3].';

    expect(linkCitationMarkers(text)).toBe(
      'Use `items[1]` and\n```js\nconst first = list[2];\n```\nthen see [3](#cite-3).',
    );
  });
});

describe('AnswerMarkdown', () => {
  it('renders markers as chips linking to the cited page', () => {
    render(
      <AnswerMarkdown
        content={'Open **Settings** [1].\n\n```bash\nacme keys rotate\n```'}
        citations={[{ index: 1, title: 'Authentication › API keys', url: 'https://docs.acme.dev/auth' }]}
      />,
    );

    const chip = screen.getByRole('link', { name: '1' });

    expect(chip).toHaveAttribute('href', 'https://docs.acme.dev/auth');
    expect(chip).toHaveAttribute('title', 'Authentication › API keys');
    expect(screen.getByText('Settings').tagName).toBe('STRONG');
    expect(screen.getByText('acme keys rotate').closest('pre')).toBeInTheDocument();
  });

  it('renders a plain chip when the citation has no url', () => {
    render(<AnswerMarkdown content="See [2]." citations={[{ index: 2, title: 'Pasted notes', url: null }]} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('opens ordinary links in a new tab', () => {
    render(<AnswerMarkdown content="Read the [guide](https://docs.acme.dev/guide)." citations={[]} />);

    const link = screen.getByRole('link', { name: 'guide' });

    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });
});
