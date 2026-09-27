import { ApiError } from '@google/genai';

export const DAILY_EMBED_QUOTA = 'EmbedContentRequestsPerDayPerProjectPerModel-FreeTier';
export const MINUTE_EMBED_QUOTA = 'EmbedContentRequestsPerMinutePerProjectPerModel-FreeTier';
export const MINUTE_CHAT_QUOTA = 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier';
export const DAILY_CHAT_QUOTA = 'GenerateRequestsPerDayPerProjectPerModel-FreeTier';

const EMBED_METRIC = 'generativelanguage.googleapis.com/embed_content_free_tier_requests';

type Violation = { quotaId: string; quotaMetric?: string };

/**
 * The body the Gemini API sends with a 429, shaped like the ones the live site got: a Help link,
 * a QuotaFailure naming the quota, and a RetryInfo with the suggested delay.
 */
export const quotaBody = ({
  violations = [{ quotaId: DAILY_EMBED_QUOTA }],
  retryDelay = '37s',
}: { violations?: Violation[]; retryDelay?: string | null } = {}) => ({
  error: {
    code: 429,
    message:
      'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/usage?tab=rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/embed_content_free_tier_requests, limit: 1000, model: gemini-embedding-2\nPlease retry in 37.270531436s.',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.Help',
        links: [
          {
            description: 'Learn more about Gemini API quotas',
            url: 'https://ai.google.dev/gemini-api/docs/rate-limits',
          },
        ],
      },
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: violations.map((violation) => ({
          quotaMetric: violation.quotaMetric ?? EMBED_METRIC,
          quotaId: violation.quotaId,
          quotaDimensions: { location: 'global', model: 'gemini-embedding-2' },
          quotaValue: '1000',
        })),
      },
      ...(retryDelay === null
        ? []
        : [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }]),
    ],
  },
});

/** What the SDK throws for a refused request: the body, stringified, as the message. */
export const quotaApiError = (options?: Parameters<typeof quotaBody>[0]) =>
  new ApiError({ message: JSON.stringify(quotaBody(options)), status: 429 });

/** A per-minute refusal with the delay Gemini suggested, or none. */
export const minuteLimit = (retryDelay: string | null = '37s', quotaId = MINUTE_EMBED_QUOTA) =>
  quotaApiError({ violations: [{ quotaId }], retryDelay });

/** The day's cap. Gemini still suggests a short delay with it, which must not be taken at its word. */
export const dailyLimit = (quotaId = DAILY_EMBED_QUOTA) =>
  quotaApiError({ violations: [{ quotaId }], retryDelay: '37s' });
