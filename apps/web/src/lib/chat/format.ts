/** Latency for the answer footer: "0.8s", "12s". Dates come from `lib/format`, not from here. */
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
