import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../src/lib/db/types';

/**
 * The demo history's rows in the database: counting them, and deleting them when the seed
 * refreshes the history. Separate from `seed-demo.ts` so the deletion can be tested against the
 * local database with a throwaway account instead of the demo.
 */

export type Service = SupabaseClient<Database>;

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
