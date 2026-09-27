// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { ModelBusyError, ProviderError, ProviderLimitError } from '@/lib/ai';
import { pausedUntil } from '@/lib/knowledge/indexing-paused';

import { BUSY_FAILURE, GENERIC_FAILURE, humanizeIngestError, IngestError } from './errors';
import { FetchPageError } from './http';

describe('humanizeIngestError', () => {
  it('passes our own sentences through', () => {
    expect(humanizeIngestError(new IngestError('The sitemap lists no pages.'))).toBe(
      'The sitemap lists no pages.',
    );
    expect(humanizeIngestError(new FetchPageError('https://x.test/', 'HTTP 404'))).toBe(
      'Could not fetch https://x.test/: HTTP 404.',
    );
  });

  it('maps provider failures to what happened and what to try', () => {
    expect(humanizeIngestError(new ModelBusyError(['gemini-embedding-2']))).toBe(
      'The embedding model is busy right now. Re-index in a few minutes.',
    );
    expect(humanizeIngestError(new ProviderError(502, 'Expected 3 embeddings, received 2.'))).toBe(
      'The embedding provider could not process the passages (HTTP 502). Re-index in a moment.',
    );
  });

  it('says a run the daily limit stopped is paused, and until when, in plain words', () => {
    const resetAt = new Date('2026-09-28T07:00:00Z');
    const message = humanizeIngestError(
      new ProviderLimitError({
        scope: 'day',
        retryDelayMs: 37_000,
        quotaId: 'EmbedContentRequestsPerDayPerProjectPerModel-FreeTier',
        models: ['gemini-embedding-2'],
        resetAt,
      }),
    );

    expect(message).toBe(
      "Indexing paused: the AI provider's daily limit for this deployment is used up. It resets at 2026-09-28T07:00:00.000Z; re-index after that.",
    );
    expect(pausedUntil(message)).toEqual(resetAt);
    expect(message).not.toMatch(/gemini|quota|429|busy/i);
  });

  it('keeps the busy sentence for a per-minute limit', () => {
    expect(
      humanizeIngestError(
        new ProviderLimitError({
          scope: 'minute',
          retryDelayMs: 37_000,
          quotaId: 'EmbedContentRequestsPerMinutePerProjectPerModel-FreeTier',
          models: ['gemini-embedding-2'],
        }),
      ),
    ).toBe(BUSY_FAILURE);
  });

  it('keeps the key setting out of the row and in the server log', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const message = humanizeIngestError(
      new ProviderError(403, 'API key not valid. Please pass a valid API key.'),
    );

    expect(message).toBe(
      'The embedding provider turned the request down, so nothing new was indexed. Re-index later.',
    );
    expect(message).not.toMatch(/[A-Z]+_[A-Z_]+|API key/);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('GEMINI_API_KEY'),
      expect.any(ProviderError),
    );

    error.mockRestore();
  });

  it('never shows library text and logs it instead', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const zip = new Error(
      "Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/",
    );

    expect(humanizeIngestError(zip)).toBe(GENERIC_FAILURE);
    expect(humanizeIngestError('a string')).toBe(GENERIC_FAILURE);
    expect(error).toHaveBeenCalledTimes(2);

    error.mockRestore();
  });

  it('explains a run that timed out', () => {
    const timeout = new Error('The operation was aborted due to timeout');

    timeout.name = 'TimeoutError';
    expect(humanizeIngestError(timeout)).toContain('took too long');
  });
});
