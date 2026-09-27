'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** How close to the bottom (in px) still counts as "reading the latest". */
export const PIN_THRESHOLD = 48;

/** A move up smaller than this is layout jitter (sub-pixel rounding), not the reader. */
const JITTER_PX = 2;

export type ScrollReading = {
  /** scrollTop now. */
  top: number;
  /** scrollTop at the previous reading. */
  previousTop: number;
  scrollHeight: number;
  clientHeight: number;
};

/**
 * Whether the thread keeps following the latest after a scroll event. Only the reader moving up
 * lets go. Content growing below (a streamed chunk that lands between our scroll to the bottom
 * and the browser's scroll event, easily more than the threshold on a phone), or a scroll on its
 * way down, never does; reaching the bottom always takes hold again.
 */
export const followsLatest = (pinned: boolean, reading: ScrollReading) => {
  if (reading.scrollHeight - reading.top - reading.clientHeight < PIN_THRESHOLD) {
    return true;
  }

  if (reading.top < reading.previousTop - JITTER_PX) {
    return false;
  }

  return pinned;
};

/** Keys that scroll a focused container up. */
const UP_KEYS = new Set(['ArrowUp', 'PageUp', 'Home']);

/**
 * Keeps a scroll container pinned to its bottom while content grows, until the reader scrolls up
 * themselves (a wheel or a finger pulling the thread down, a key, or the scrollbar). `pinned`
 * drives the "Jump to latest" pill; `scrollToBottom` (sending a message, the pill) takes hold again.
 */
export const useAutoscroll = (signal: unknown) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const lastTop = useRef(0);
  const touchY = useRef<number | null>(null);
  const [pinned, setPinned] = useState(true);

  const hold = useCallback((next: boolean) => {
    pinnedRef.current = next;
    setPinned(next);
  }, []);

  const measure = useCallback(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const reading: ScrollReading = {
      top: element.scrollTop,
      previousTop: lastTop.current,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    };

    lastTop.current = reading.top;
    hold(followsLatest(pinnedRef.current, reading));
  }, [hold]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const element = ref.current;

      hold(true);

      if (element) {
        element.scrollTo({ top: element.scrollHeight, behavior });
      }
    },
    [hold],
  );

  useLayoutEffect(() => {
    const element = ref.current;

    if (element && pinnedRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [signal]);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    // Streamed text, code blocks and tables grow the thread after each paint; stay pinned through it.
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) {
        element.scrollTop = element.scrollHeight;
      }
    });

    observer.observe(element);

    if (element.firstElementChild) {
      observer.observe(element.firstElementChild);
    }

    return () => observer.disconnect();
  }, []);

  // The reader's own gestures stop the following at once, before their scroll event arrives: a
  // chunk that lands in between would otherwise pull the thread back down under their finger.
  // The scroll event that follows decides whether the pill shows (a nudge near the bottom does
  // not count); a thread with nowhere to scroll up is left alone.
  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const letGo = () => {
      if (element.scrollTop > 0) {
        pinnedRef.current = false;
      }
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        letGo();
      }
    };
    const onTouchStart = (event: TouchEvent) => {
      touchY.current = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY;

      // A finger moving down the screen scrolls the thread up.
      if (touchY.current !== null && y !== undefined && y > touchY.current + JITTER_PX) {
        letGo();
      }
    };
    const onTouchEnd = () => {
      touchY.current = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (UP_KEYS.has(event.key) && event.target === element) {
        letGo();
      }
    };

    element.addEventListener('wheel', onWheel, { passive: true });
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: true });
    element.addEventListener('touchend', onTouchEnd, { passive: true });
    element.addEventListener('touchcancel', onTouchEnd, { passive: true });
    element.addEventListener('keydown', onKeyDown);

    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
      element.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return { ref, pinned, onScroll: measure, scrollToBottom };
};
