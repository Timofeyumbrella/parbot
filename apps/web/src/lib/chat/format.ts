const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact relative time for list rows: "now", "5m", "3h", "2d", then a short date. */
export const relativeTime = (iso: string | null, now = Date.now()) => {
  if (!iso) {
    return '';
  }

  const then = Date.parse(iso);

  if (Number.isNaN(then)) {
    return '';
  }

  const elapsed = Math.max(now - then, 0);

  if (elapsed < MINUTE) {
    return 'now';
  }

  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m`;
  }

  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)}h`;
  }

  if (elapsed < 7 * DAY) {
    return `${Math.floor(elapsed / DAY)}d`;
  }

  const date = new Date(then);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();

  return date.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
};

/** Latency for the answer footer: "0.8s", "12s". */
export const formatLatency = (ms: number | null) => {
  if (ms === null || ms < 0) {
    return '';
  }

  if (ms < 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
};

/** The hostname of a citation url, for the sources row. Falls back to the raw text. */
export const hostnameOf = (url: string | null) => {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};
