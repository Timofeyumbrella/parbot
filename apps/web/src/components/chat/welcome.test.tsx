import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Welcome } from './welcome';

const LONG_QUESTION =
  'What happens when the docs do not cover a question and the visitor asks it anyway?';

const assistant = {
  name: 'Acme Docs',
  welcome_message: 'Ask me anything about the Acme docs.',
  suggested_questions: ['How do I rotate an API key?', LONG_QUESTION],
};

describe('Welcome', () => {
  it('shows the name, the welcome line and every suggested question in full', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();

    render(<Welcome assistant={assistant} onPick={onPick} />);

    expect(screen.getByRole('heading', { name: 'Acme Docs' })).toBeInTheDocument();
    expect(screen.getByText('Ask me anything about the Acme docs.')).toBeInTheDocument();

    const chips = within(screen.getByRole('list', { name: 'Suggested questions' })).getAllByRole(
      'button',
    );

    expect(chips.map((chip) => chip.textContent)).toEqual(assistant.suggested_questions);

    // The pane is empty, so a long question wraps: nothing may cap the chip's width or height
    // or cut its text short.
    for (const chip of chips) {
      expect(chip.className).not.toMatch(
        /truncate|whitespace-nowrap|text-ellipsis|overflow-hidden|(^|\s)(h|w|max-w)-(xs|sm|md|\d)/,
      );
    }

    await user.click(screen.getByRole('button', { name: LONG_QUESTION }));

    expect(onPick).toHaveBeenCalledWith(LONG_QUESTION);
  });

  it('disables the chips while a send is in flight', () => {
    render(<Welcome assistant={assistant} onPick={vi.fn()} disabled />);

    for (const chip of screen.getAllByRole('button')) {
      expect(chip).toBeDisabled();
    }
  });
});
