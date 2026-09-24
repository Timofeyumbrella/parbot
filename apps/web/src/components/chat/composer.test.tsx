import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDrafts } from '@/lib/chat/drafts';

import { Composer } from './composer';

beforeEach(() => {
  resetDrafts();
});

const box = () => screen.getByRole('textbox', { name: 'Message' });

describe('Composer', () => {
  it('sends on Enter, trims the text and clears the box', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(<Composer draftKey="c1" onSend={onSend} />);
    await user.type(box(), '  How are webhooks signed?  {Enter}');

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('How are webhooks signed?');
    expect(box()).toHaveValue('');
  });

  it('Shift+Enter adds a line instead of sending', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(<Composer draftKey="c1" onSend={onSend} />);
    await user.type(box(), 'line one{Shift>}{Enter}{/Shift}line two');

    expect(onSend).not.toHaveBeenCalled();
    expect(box()).toHaveValue('line one\nline two');
  });

  it('does not send while an IME composition is in progress', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(<Composer draftKey="c1" onSend={onSend} />);
    await user.type(box(), 'こんにちは');
    fireEvent.keyDown(box(), { key: 'Enter', keyCode: 229 });

    expect(onSend).not.toHaveBeenCalled();
    expect(box()).toHaveValue('こんにちは');
  });

  it('ignores whitespace-only submits', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(<Composer draftKey="c1" onSend={onSend} />);
    await user.type(box(), '   {Enter}');

    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables Send only while the box is empty', async () => {
    const user = userEvent.setup();

    render(<Composer draftKey="c1" onSend={vi.fn()} />);

    const send = screen.getByRole('button', { name: 'Send' });

    expect(send).toBeDisabled();
    await user.type(box(), 'x');
    expect(send).toBeEnabled();
    await user.clear(box());
    expect(send).toBeDisabled();
  });

  it('shows Stop in place of Send while streaming and does not send', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const onStop = vi.fn();

    render(<Composer draftKey="c1" onSend={onSend} onStop={onStop} streaming />);

    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
    await user.type(box(), 'another question{Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect(box()).toHaveValue('another question');

    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('keeps an unsent draft across a remount with the same key and drops it after a send', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const first = render(<Composer draftKey="c1" onSend={onSend} />);

    await user.type(box(), 'half a thought');
    first.unmount();

    const second = render(<Composer draftKey="c1" onSend={onSend} />);

    expect(box()).toHaveValue('half a thought');
    await user.type(box(), '{Enter}');
    expect(onSend).toHaveBeenCalledWith('half a thought');
    second.unmount();

    render(<Composer draftKey="c1" onSend={onSend} />);
    expect(box()).toHaveValue('');
  });

  it('shows the remaining characters as the limit approaches', () => {
    render(<Composer draftKey="c1" onSend={vi.fn()} />);
    // One change event, not 1,850 keystrokes: a paste is what a reader does with text this long.
    fireEvent.change(box(), { target: { value: 'x'.repeat(1850) } });

    expect(screen.getByText('150 left')).toBeVisible();
  });
});
