import type { SupabaseClient } from '@supabase/supabase-js';

import type { AiProvider } from '@/lib/ai';
import type { Database } from '@/lib/db';

export type ServiceClient = SupabaseClient<Database>;

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentUrl: string | null;
  heading: string | null;
  content: string;
  similarity: number;
};

export const RETRIEVAL_MATCH_COUNT = 8;
export const RETRIEVAL_THRESHOLD = 0.3;
/** Roughly 3k tokens of context: enough for a docs answer, cheap on the free tier. */
export const MAX_CONTEXT_CHARS = 12_000;
const SHORT_QUESTION_CHARS = 40;

/**
 * A short follow-up ("and on Windows?") embeds badly on its own, so the previous question is
 * folded into the query text. Longer questions stand on their own.
 */
export const retrievalQuery = (question: string, previousQuestion?: string | null) =>
  previousQuestion && question.trim().length < SHORT_QUESTION_CHARS
    ? `${previousQuestion.trim()} ${question.trim()}`
    : question.trim();

export const trimToBudget = (chunks: RetrievedChunk[], budget = MAX_CONTEXT_CHARS) => {
  const kept: RetrievedChunk[] = [];
  let used = 0;

  for (const chunk of chunks) {
    if (used + chunk.content.length > budget && kept.length > 0) {
      break;
    }

    kept.push(chunk);
    used += chunk.content.length;
  }

  return kept;
};

export const retrieveChunks = async (
  service: ServiceClient,
  provider: AiProvider,
  assistantId: string,
  query: string,
): Promise<RetrievedChunk[]> => {
  const [embedding] = await provider.embed([{ text: query }], 'query');

  if (!embedding) {
    throw new Error('The embedding provider returned no vector.');
  }

  const { data, error } = await service.rpc('match_chunks', {
    assistant: assistantId,
    query_embedding: JSON.stringify(embedding),
    match_count: RETRIEVAL_MATCH_COUNT,
    similarity_threshold: RETRIEVAL_THRESHOLD,
  });

  if (error) {
    throw new Error(`Retrieval failed: ${error.message}`);
  }

  return trimToBudget(
    (data ?? []).map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      documentUrl: row.document_url,
      heading: row.heading,
      content: row.content,
      similarity: row.similarity,
    })),
  );
};
