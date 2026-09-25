import { ModelBusyError, ProviderError } from '@/lib/ai';

import { FetchPageError } from './http';

/** A failure phrased for the person who added the source; shown on the row as it is. */
export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestError';
  }
}

export const GENERIC_FAILURE = 'Something went wrong while indexing. Re-index to try again.';

/**
 * The sentence that goes on the source row. Our own errors and fetch failures already say what
 * happened; provider and library errors are mapped, never passed through.
 */
export const humanizeIngestError = (cause: unknown): string => {
  if (cause instanceof IngestError || cause instanceof FetchPageError) {
    return cause.message.slice(0, 500);
  }

  if (cause instanceof ModelBusyError) {
    return 'The embedding model is busy right now. Re-index in a few minutes.';
  }

  if (cause instanceof ProviderError) {
    if (cause.status === 401 || cause.status === 403) {
      // The key is the operator's to fix; the row speaks to the account that added the source.
      console.error(
        '[ingest] the embedding provider refused the API key; check GEMINI_API_KEY',
        cause,
      );

      return 'The embedding provider turned the request down, so nothing new was indexed. Re-index later.';
    }

    return `The embedding provider could not process the passages (HTTP ${cause.status}). Re-index in a moment.`;
  }

  if (cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) {
    return 'Indexing took too long and was stopped. Re-index to pick up where it left off.';
  }

  console.error('[ingest] unexpected failure', cause);

  return GENERIC_FAILURE;
};
