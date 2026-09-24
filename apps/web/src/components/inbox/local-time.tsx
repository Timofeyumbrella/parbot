'use client';

import { useSyncExternalStore } from 'react';

import { formatDateTime, relativeTime } from '@/lib/format';

const noop = () => () => {};

/** False during server rendering and hydration, true once the page runs in the browser. */
const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

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
export const LocalTime = ({ value, now, className }: LocalTimeProps) => {
  const hydrated = useHydrated();

  return (
    <time dateTime={value} title={hydrated ? formatDateTime(value) : undefined} className={className}>
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
