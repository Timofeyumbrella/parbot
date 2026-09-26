import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLayoutEffect } from 'react';
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

  describe('when the box is replaced by another for the same conversation', () => {
    // Where focus is as the commit that swaps the boxes ends, before any effect of theirs runs.
    let focusAtCommit: Element | null = null;
    const Probe = () => {
      useLayoutEffect(() => {
        focusAtCommit = document.activeElement;
      });

      return null;
    };

    /** The pane a click rendered, then the route's page taking over: a new element, same key. */
    const Screen = ({ routed, onSend }: { routed: boolean; onSend: (text: string) => void }) =>
      routed ? (
        <section>
          <Composer draftKey="c1" onSend={onSend} />
          <Probe />
        </section>
      ) : (
        <div>
          <Composer draftKey="c1" onSend={onSend} />
        </div>
      );

    beforeEach(() => {
      focusAtCommit = null;
    });

    it('hands the focus and the caret over in the same commit, so the next key lands', async () => {
      const user = userEvent.setup();
      const onSend = vi.fn();
      const view = render(<Screen routed={false} onSend={onSend} />);

      await user.type(box(), 'Which scopes a key carry?');
      // The caret sits where the reader put it, not at the end.
      (box() as HTMLTextAreaElement).setSelectionRange(13, 13);

      const replaced = box();

      view.rerender(<Screen routed onSend={onSend} />);

      expect(box()).not.toBe(replaced);
      expect(focusAtCommit).toBe(box());
      expect(box()).toHaveFocus();
      expect(box()).toHaveValue('Which scopes a key carry?');

      await user.keyboard('does {Enter}');

      expect(onSend).toHaveBeenCalledWith('Which scopes does a key carry?');
    });

    it('leaves focus alone when the box was not focused, or when it left for good', async () => {
      const user = userEvent.setup();
      const first = render(<Screen routed={false} onSend={vi.fn()} />);

      await user.type(box(), 'half a thought');
      await user.click(document.body);
      first.rerender(<Screen routed onSend={vi.fn()} />);

      expect(box()).not.toHaveFocus();
      first.unmount();

      // Focused as it goes, then a later visit to the same conversation.
      const second = render(<Screen routed={false} onSend={vi.fn()} />);

      await user.click(box());
      second.unmount();
      await Promise.resolve();
      render(<Screen routed onSend={vi.fn()} />);

      expect(box()).not.toHaveFocus();
      expect(box()).toHaveValue('half a thought');
    });
  });

  it('shows the remaining characters as the limit approaches', () => {
    render(<Composer draftKey="c1" onSend={vi.fn()} />);
    // One change event, not 1,850 keystrokes: a paste is what a reader does with text this long.
    fireEvent.change(box(), { target: { value: 'x'.repeat(1850) } });

    expect(screen.getByText('150 left')).toBeVisible();
  });
});
