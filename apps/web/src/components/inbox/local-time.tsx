'use client';

import { useSyncExternalStore } from 'react';

import { useHydrated } from '@/hooks/use-hydrated';
import { formatDateTime, relativeTime } from '@/lib/format';

const CLOCK_MS = 30_000;

// One shared clock for every relative time on the page. It stays at zero until the first
// tick, so hydration shows exactly what the server rendered and tests read the request clock.
let tick = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

const subscribeClock = (notify: () => void) => {
  listeners.add(notify);
  timer ??= setInterval(() => {
    tick = Date.now();
    listeners.forEach((listener) => listener());
  }, CLOCK_MS);

  return () => {
    listeners.delete(notify);

    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
};

const getTick = () => tick;
const getServerTick = () => 0;

/**
 * The reference time for "5 min ago": the request's clock, moved forward in half-minute steps
 * once the page is open so it does not freeze in time. It never runs behind the request.
 */
export const useNow = (initial: number) =>
  Math.max(useSyncExternalStore(subscribeClock, getTick, getServerTick), initial);

type LocalTimeProps = {
  value: string;
  /** The request's clock, so the server and the first client render agree on "5 min ago". */
  now: number;
  className?: string;
};

/**
 * A relative time whose tooltip is the absolute moment in the viewer's time zone. The tooltip
 * is added after hydration because the server cannot know the viewer's zone, and a mismatch
 * would otherwise be reported.
 */
export const LocalTime = ({ value, now: initial, className }: LocalTimeProps) => {
  const hydrated = useHydrated();
  const now = useNow(initial);

  return (
    <time
      dateTime={value}
      title={hydrated ? formatDateTime(value) : undefined}
      className={className}
    >
      {relativeTime(value, new Date(now))}
    </time>
  );
};

/** The absolute moment in the viewer's time zone; empty until the page has hydrated. */
export const AbsoluteTime = ({ value, className }: { value: string; className?: string }) => {
  const hydrated = useHydrated();

  return (
    <time dateTime={value} className={className}>
      {hydrated ? formatDateTime(value) : ''}
    </time>
  );
};
