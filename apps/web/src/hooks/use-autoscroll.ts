'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** How close to the bottom (in px) still counts as "reading the latest". */
const PIN_THRESHOLD = 48;

/** A smooth scroll to the bottom fires scroll events on its way; they must not read as the reader scrolling up. */
const SMOOTH_SCROLL_MS = 800;

/**
 * Keeps a scroll container pinned to its bottom while content grows, unless the reader scrolled
 * up on purpose. `pinned` drives the "Jump to latest" pill.
 */
export const useAutoscroll = (signal: unknown) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const settlingUntil = useRef(0);
  const [pinned, setPinned] = useState(true);

  const measure = useCallback(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const atBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < PIN_THRESHOLD;

    if (atBottom) {
      settlingUntil.current = 0;
    } else if (Date.now() < settlingUntil.current) {
      // Still travelling down after "Jump to latest": stay pinned until it lands.
      return;
    }

    pinnedRef.current = atBottom;
    setPinned(atBottom);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const element = ref.current;

    pinnedRef.current = true;
    settlingUntil.current = behavior === 'smooth' ? Date.now() + SMOOTH_SCROLL_MS : 0;
    setPinned(true);

    if (element) {
      element.scrollTo({ top: element.scrollHeight, behavior });
    }
  }, []);

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

    // Code blocks and tables settle their height after the first paint; stay pinned through it.
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

  return { ref, pinned, onScroll: measure, scrollToBottom };
};
