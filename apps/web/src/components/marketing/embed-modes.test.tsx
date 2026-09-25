import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PLANS } from '@/lib/plans';

import { EmbedModes, embedSnippet } from './embed-modes';

afterEach(cleanup);

describe('embedSnippet', () => {
  it('is one script tag pointing at the app origin', () => {
    expect(embedSnippet('https://app.parbot.dev/')).toBe(
      '<script src="https://app.parbot.dev/widget.js" data-parbot="pb_your_public_key" async></script>',
    );
    expect(embedSnippet('http://localhost:3000')).toContain(
      'src="http://localhost:3000/widget.js"',
    );
  });
});

describe('EmbedModes', () => {
  it('shows both modes, the snippet and which plans include the palette', () => {
    render(<EmbedModes appUrl="https://app.parbot.dev" />);

    expect(screen.getByRole('heading', { level: 3, name: 'Bubble' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '⌘K palette' })).toBeInTheDocument();
    expect(screen.getByLabelText('Widget install snippet')).toHaveTextContent(
      '<script src="https://app.parbot.dev/widget.js" data-parbot="pb_your_public_key" async></script>',
    );
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(
      screen.getByText(new RegExp(`On ${PLANS.starter.name} and ${PLANS.growth.name}`)),
    ).toBeInTheDocument();
  });
});
