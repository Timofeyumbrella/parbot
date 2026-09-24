const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const toDate = (value: string | number | Date) => (value instanceof Date ? value : new Date(value));

/** "Sep 24, 2026" */
export const formatDate = (value: string | number | Date) => dateFormat.format(toDate(value));

/** "Sep 24, 2026, 2:15 PM" in the viewer's time zone. */
export const formatDateTime = (value: string | number | Date) => dateTimeFormat.format(toDate(value));

/**
 * "just now", "5 min ago", "3 hr ago", "yesterday", "4 days ago", then the date. One helper for
 * every screen so the same moment never reads differently in two places. Relative output depends
 * on the clock, so render it on the client or mark the node with suppressHydrationWarning.
 */
export const relativeTime = (value: string | number | Date, now: Date = new Date()) => {
  const then = toDate(value).getTime();
  const elapsed = now.getTime() - then;

  if (Number.isNaN(then)) {
    return '';
  }

  if (elapsed < MINUTE) {
    return 'just now';
  }

  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} min ago`;
  }

  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} hr ago`;
  }

  if (elapsed < 7 * DAY) {
    return relative.format(-Math.floor(elapsed / DAY), 'day');
  }

  return formatDate(then);
};

/** "1,234" */
export const formatCount = (value: number) => value.toLocaleString('en-US');

/** "42%" from a numerator and denominator, tolerant of zero. */
export const formatPercent = (part: number, whole: number) =>
  whole === 0 ? '0%' : `${Math.round((part / whole) * 100)}%`;
