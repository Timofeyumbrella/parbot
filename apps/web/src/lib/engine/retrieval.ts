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
  /** Set on passages read from a source the reader referenced, which the prompt marks. */
  sourceId?: string;
  referenced?: boolean;
};

export type RetrieveOptions = {
  /** Sources the reader pointed at: their best passages are read whatever the similarity. */
  sourceIds?: string[];
};

export const RETRIEVAL_MATCH_COUNT = 8;
export const RETRIEVAL_THRESHOLD = 0.3;
/** Passages read from each referenced source, before the budget trims the list. */
export const REFERENCE_PASSAGES_PER_SOURCE = 4;
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

/**
 * Referenced passages first, in the order they came (each source's best, then each one's second
 * best), then the ordinary matches that are not already there. A passage appears once.
 */
export const mergeReferenced = (referenced: RetrievedChunk[], matched: RetrievedChunk[]) => {
  const seen = new Set<string>();

  return [...referenced, ...matched].filter((chunk) => {
    if (seen.has(chunk.chunkId)) {
      return false;
    }

    seen.add(chunk.chunkId);

    return true;
  });
};

type MatchRow = {
  chunk_id: string;
  document_id: string;
  document_title: string;
  document_url: string | null;
  heading: string | null;
  content: string;
  similarity: number;
};

const toChunk = (row: MatchRow): RetrievedChunk => ({
  chunkId: row.chunk_id,
  documentId: row.document_id,
  documentTitle: row.document_title,
  documentUrl: row.document_url,
  heading: row.heading,
  content: row.content,
  similarity: row.similarity,
});

/**
 * The passages a question is answered from. With references, the best passages of each referenced
 * source are always read (the reader said where to look, so a question worded unlike the file
 * still finds it), then the usual top matches across the assistant fill what budget is left.
 */
export const retrieveChunks = async (
  service: ServiceClient,
  provider: AiProvider,
  assistantId: string,
  query: string,
  options: RetrieveOptions = {},
): Promise<RetrievedChunk[]> => {
  const [embedding] = await provider.embed([{ text: query }], 'query');

  if (!embedding) {
    throw new Error('The embedding provider returned no vector.');
  }

  const queryEmbedding = JSON.stringify(embedding);
  const sourceIds = [...new Set(options.sourceIds ?? [])];
  const [matched, referenced] = await Promise.all([
    service.rpc('match_chunks', {
      assistant: assistantId,
      query_embedding: queryEmbedding,
      match_count: RETRIEVAL_MATCH_COUNT,
      similarity_threshold: RETRIEVAL_THRESHOLD,
    }),
    sourceIds.length > 0
      ? service.rpc('match_chunks_in_sources', {
          assistant: assistantId,
          query_embedding: queryEmbedding,
          source_ids: sourceIds,
          per_source: REFERENCE_PASSAGES_PER_SOURCE,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const error = matched.error ?? referenced.error;

  if (error) {
    throw new Error(`Retrieval failed: ${error.message}`);
  }

  return trimToBudget(
    mergeReferenced(
      (referenced.data ?? []).map((row) => ({
        ...toChunk(row),
        sourceId: row.source_id,
        referenced: true,
      })),
      (matched.data ?? []).map(toChunk),
    ),
  );
};
