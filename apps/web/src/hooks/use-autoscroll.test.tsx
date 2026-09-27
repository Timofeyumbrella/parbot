import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { followsLatest, PIN_THRESHOLD, useAutoscroll } from './use-autoscroll';

describe('followsLatest', () => {
  const reading = (top: number, previousTop: number, scrollHeight = 3000) => ({
    top,
    previousTop,
    scrollHeight,
    clientHeight: 700,
  });

  it('takes hold at the bottom, whatever it had', () => {
    expect(followsLatest(false, reading(2300, 1000))).toBe(true);
    expect(followsLatest(false, reading(2300 - PIN_THRESHOLD + 1, 2400))).toBe(true);
  });

  it('keeps following when content grew below faster than the scroll', () => {
    // Scrolled to the bottom of 2000, then a chunk made it 2400 before the scroll event.
    expect(followsLatest(true, reading(1300, 1300, 2400))).toBe(true);
    expect(followsLatest(true, reading(1300, 900, 2400))).toBe(true);
  });

  it('lets go only when the reader moves up', () => {
    expect(followsLatest(true, reading(1500, 2300))).toBe(false);
    // Sub-pixel jitter is not the reader.
    expect(followsLatest(true, reading(1299, 1300, 2400))).toBe(true);
  });

  it('stays let go while the reader scrolls around above the bottom', () => {
    expect(followsLatest(false, reading(1600, 1500))).toBe(false);
    expect(followsLatest(false, reading(1400, 1500))).toBe(false);
  });
});

/** A thread's scroll container with the geometry a phone gives it, driven by hand. */
const Probe = ({ signal }: { signal: number }) => {
  const { ref, pinned, onScroll, scrollToBottom } = useAutoscroll(signal);

  return (
    <div>
      <div ref={ref} onScroll={onScroll} data-testid="scroller" tabIndex={-1}>
        <div />
      </div>
      <span data-testid="pinned">{pinned ? 'yes' : 'no'}</span>
      <button type="button" onClick={() => scrollToBottom()}>
        Send
      </button>
    </div>
  );
};

let resize: (() => void)[] = [];

beforeEach(() => {
  resize = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const setUp = () => {
  const view = render(<Probe signal={0} />);
  const element = screen.getByTestId('scroller');
  const box = { top: 0, height: 700, client: 700 };
  const clamp = (top: number) => Math.max(0, Math.min(top, box.height - box.client));

  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => box.top,
    set: (top: number) => {
      box.top = clamp(top);
    },
  });
  Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => box.height });
  Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => box.client });
  element.scrollTo = ((options: ScrollToOptions) => {
    box.top = clamp(options.top ?? box.top);
  }) as typeof element.scrollTo;

  return {
    view,
    element,
    box,
    /** Content grew; the browser runs the resize observers after layout. */
    grow: (height: number) => {
      box.height = height;
      act(() => resize.forEach((callback) => callback()));
    },
    /** The browser's scroll event, read against whatever the layout is by then. */
    scrolled: () => fireEvent.scroll(element),
    pinned: () => screen.getByTestId('pinned').textContent === 'yes',
  };
};

describe('useAutoscroll', () => {
  it('follows a streaming answer after a message taller than the screen', () => {
    const thread = setUp();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    thread.view.rerender(<Probe signal={1} />);
    // The question alone is taller than the phone's screen.
    thread.grow(2000);
    expect(thread.box.top).toBe(1300);

    // A chunk lands between our scroll and the browser's scroll event: more than the threshold
    // below, which used to read as the reader scrolling away.
    thread.box.height = 2200;
    thread.scrolled();
    expect(thread.pinned()).toBe(true);

    thread.grow(2600);
    expect(thread.box.top).toBe(1900);
    thread.scrolled();
    expect(thread.pinned()).toBe(true);
  });

  it('lets go when the reader scrolls up, and takes hold again at the bottom', () => {
    const thread = setUp();

    thread.grow(2000);
    thread.scrolled();

    thread.element.scrollTop = 900;
    thread.scrolled();
    expect(thread.pinned()).toBe(false);

    // The answer keeps streaming; the reader stays where they are.
    thread.grow(2400);
    expect(thread.box.top).toBe(900);

    thread.element.scrollTop = 2400;
    thread.scrolled();
    expect(thread.pinned()).toBe(true);
    thread.grow(2800);
    expect(thread.box.top).toBe(2100);
  });

  it('lets go the moment a finger pulls the thread down, before the scroll event', () => {
    const thread = setUp();

    thread.grow(2000);
    thread.scrolled();

    fireEvent.touchStart(thread.element, { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(thread.element, { touches: [{ clientY: 360 }] });
    // A chunk lands before the scroll event: the thread must not jump back under the finger.
    thread.element.scrollTop = 1240;
    thread.grow(2300);
    expect(thread.box.top).toBe(1240);

    thread.scrolled();
    expect(thread.pinned()).toBe(false);
  });

  it('lets go on a wheel up, but not on a thread with nowhere to scroll', () => {
    const short = setUp();

    fireEvent.wheel(short.element, { deltaY: -120 });
    short.grow(1500);
    expect(short.box.top).toBe(800);
    short.view.unmount();

    const thread = setUp();

    thread.grow(2000);
    thread.scrolled();
    fireEvent.wheel(thread.element, { deltaY: -120 });
    thread.grow(2200);
    expect(thread.box.top).toBe(1300);
  });

  it('takes hold again when the reader sends', () => {
    const thread = setUp();

    thread.grow(2000);
    thread.scrolled();
    thread.element.scrollTop = 200;
    thread.scrolled();
    expect(thread.pinned()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(thread.pinned()).toBe(true);
    expect(thread.box.top).toBe(1300);

    thread.grow(2500);
    expect(thread.box.top).toBe(1800);
  });
});
