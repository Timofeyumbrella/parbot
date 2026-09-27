import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../src/lib/db/types';
import type { LiveDocument, LivePassage } from './demo-history';

/**
 * The demo's rows in the database: counting the history, deleting it when the seed refreshes it,
 * and reading the knowledge its citations point at. Separate from `seed-demo.ts` so these can be
 * tested against the local database with a throwaway account instead of the demo.
 */

export type Service = SupabaseClient<Database>;

/** Rows per request when reading a whole table; PostgREST caps a response at 1,000. */
export const PAGE_SIZE = 500;

/** Throws with what was being done when a request fails, and returns its data otherwise. */
export const must = <T>(result: { data: T; error: { message: string } | null }, what: string) => {
  if (result.error) {
    throw new Error(`Could not ${what}: ${result.error.message}`);
  }

  return result.data;
};

type HistoryTable =
  | 'conversations'
  | 'messages'
  | 'message_stops'
  | 'conversation_references'
  | 'leads'
  | 'chat_projects';

export const countRows = async (service: Service, table: HistoryTable, assistantId: string) => {
  const { count, error } = await service
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('assistant_id', assistantId);

  if (error) {
    throw new Error(`Could not count ${table}: ${error.message}`);
  }

  return count ?? 0;
};

export type HistoryCounts = Record<
  'conversations' | 'messages' | 'stops' | 'references' | 'leads' | 'projects',
  number
>;

/** What the assistant's history consists of now: what a refresh is about to delete. */
export const countHistory = async (service: Service, assistantId: string) => {
  const [conversations, messages, stops, references, leads, projects] = await Promise.all([
    countRows(service, 'conversations', assistantId),
    countRows(service, 'messages', assistantId),
    countRows(service, 'message_stops', assistantId),
    countRows(service, 'conversation_references', assistantId),
    countRows(service, 'leads', assistantId),
    countRows(service, 'chat_projects', assistantId),
  ]);

  return {
    conversations,
    messages,
    stops,
    references,
    leads,
    projects,
  } satisfies HistoryCounts;
};

/** A PostgREST `in` list. */
const idList = (ids: string[]) => `(${ids.join(',')})`;

/**
 * Deletes the assistant's history except the rows in `keep`: its conversations (their messages
 * and references cascade, and a trigger removes their stops), its leads, its chat projects (their
 * file links cascade; the files are sources and stay in Knowledge) and its stops, the seeded
 * history having none of its own. The seed writes the new history first and keeps it here, so a failure part way
 * leaves the old history in place rather than an empty demo. Only this assistant's rows go: the
 * account, its settings and its knowledge stay. Returns how many conversations are left.
 */
export const deleteOldHistory = async (
  service: Service,
  assistantId: string,
  keep: { conversations: string[]; leads: string[] },
) => {
  // A lead outlives its conversation (the link is only cleared), so leads go explicitly.
  const leads = service.from('leads').delete().eq('assistant_id', assistantId);

  must(
    await (keep.leads.length > 0 ? leads.not('id', 'in', idList(keep.leads)) : leads),
    'delete the leads',
  );
  must(
    await service.from('chat_projects').delete().eq('assistant_id', assistantId),
    'delete the chat projects',
  );

  const conversations = service.from('conversations').delete().eq('assistant_id', assistantId);

  must(
    await (keep.conversations.length > 0
      ? conversations.not('id', 'in', idList(keep.conversations))
      : conversations),
    'delete the conversations',
  );
  // A stop recorded for an answer that was never saved has no conversation to go with.
  must(
    await service.from('message_stops').delete().eq('assistant_id', assistantId),
    'delete the stops',
  );

  return countRows(service, 'conversations', assistantId);
};

/**
 * Every row a query matches, read `PAGE_SIZE` at a time: one response stops at PostgREST's
 * max_rows, so a single read of a large table is an arbitrary part of it. The query must order by
 * a unique column for the pages not to overlap.
 */
export const readAll = async <T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
) => {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const batch = must(await page(from, from + PAGE_SIZE - 1), what) ?? [];

    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      return rows;
    }
  }
};

/**
 * The assistant's pages and passages as they are indexed now, all of them: a page missing from
 * the list would have its saved citations moved to another page with the same title.
 */
export const loadKnowledge = async (service: Service, assistantId: string) => {
  const documents: LiveDocument[] = await readAll(
    (from, to) =>
      service
        .from('documents')
        .select('id, title, url')
        .eq('assistant_id', assistantId)
        .order('id')
        .range(from, to),
    'load the indexed pages',
  );
  const rows = await readAll(
    (from, to) =>
      service
        .from('chunks')
        .select('id, document_id, heading, content, position')
        .eq('assistant_id', assistantId)
        .order('id')
        .range(from, to),
    'load the indexed passages',
  );
  const passages: LivePassage[] = rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    heading: row.heading,
    content: row.content,
    position: row.position,
  }));

  return { documents, passages };
};
