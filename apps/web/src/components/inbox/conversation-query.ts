import type { SupabaseClient } from '@supabase/supabase-js';

import type { ConversationFilter } from '@/lib/analytics';
import type { Conversation, Database } from '@/lib/db';

/**
 * The inbox list query, shared by the server component that paints the first page and the
 * browser client that loads the next ones. This module has no 'use client' directive on
 * purpose: a server component that imported these from the list component would only get
 * opaque client references back.
 */

export const CONVERSATION_COLUMNS =
  'id, title, channel, page_url, message_count, unanswered_count, last_message_at, created_at, project_id' as const;

export type ConversationRow = Pick<
  Conversation,
  | 'id'
  | 'title'
  | 'channel'
  | 'page_url'
  | 'message_count'
  | 'unanswered_count'
  | 'last_message_at'
  | 'created_at'
> & {
  /** The chat project an in-app conversation is in; rows read before projects existed have none. */
  project_id?: string | null;
};

/** A project's name by id, for the label on its conversations. */
export type ProjectNames = Record<string, string>;

export const inboxProjectsKey = (assistantId: string) =>
  ['inbox', assistantId, 'projects'] as const;

/** The assistant's projects by id. Works with the server and the browser client. */
export const projectNames = async (
  client: SupabaseClient<Database>,
  assistantId: string,
): Promise<ProjectNames> => {
  const { data, error } = await client
    .from('chat_projects')
    .select('id, name')
    .eq('assistant_id', assistantId);

  if (error) {
    throw new Error(error.message);
  }

  return Object.fromEntries((data ?? []).map((row) => [row.id, row.name]));
};

export const PAGE_SIZE = 30;

/**
 * Every inbox key lives under `['inbox', assistantId, ...]`. The chat keeps its own lists under
 * `['chat', ...]`; the two screens store different shapes and must never share a key.
 */
export const inboxKey = (assistantId: string) => ['inbox', assistantId] as const;

export const conversationListKey = (assistantId: string, filter: ConversationFilter) =>
  ['inbox', assistantId, 'conversations', filter] as const;

export const inboxCountsKey = (assistantId: string) => ['inbox', assistantId, 'counts'] as const;

export type InboxCounts = { conversations: number; leads: number };

export const matchesFilter = (row: ConversationRow, filter: ConversationFilter) => {
  switch (filter) {
    case 'widget':
      return row.channel === 'widget';
    case 'app':
      return row.channel === 'app';
    case 'unanswered':
      return row.unanswered_count > 0;
    default:
      return true;
  }
};

/**
 * Where the next page starts. Rows are ordered by `last_message_at` (nulls last) and then by
 * id, so a page boundary that falls inside a run of equal timestamps is still unambiguous.
 */
export type PageCursor = { at: string | null; id: string };

export type ConversationPage = { rows: ConversationRow[]; cursor: PageCursor | null };

/**
 * Trims one over-fetched result to a page. Asking for one row more than the page size is what
 * tells us whether a next page exists, so "Load more" never appears above an empty page.
 */
export const pageOf = (rows: ConversationRow[]): ConversationPage => {
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];

  return {
    rows: page,
    cursor: rows.length > PAGE_SIZE && last ? { at: last.last_message_at, id: last.id } : null,
  };
};

/** The moment a row shows as its activity: its last message, or its start while it has none. */
export const activityStamp = (row: Pick<ConversationRow, 'last_message_at' | 'created_at'>) =>
  row.last_message_at ?? row.created_at;

/**
 * A timestamp in microseconds since the epoch, the precision Postgres orders by. `Date.parse`
 * stops at milliseconds, so two messages in the same millisecond would otherwise fall back to
 * the id and could land in a different order than the server returned them.
 */
const microseconds = (stamp: string) => {
  const fraction = /\.(\d+)/.exec(stamp)?.[1] ?? '';

  return Date.parse(stamp) * 1000 + Number(fraction.slice(3, 6).padEnd(3, '0'));
};

/**
 * The list order, exactly as `conversationPage` returns it: last message first, rows that never
 * had one after every row that did, ties broken by id. The list re-sorts with this after
 * Realtime changes a row in place; any other rule would show rows in an order the keyset cursor
 * does not follow, so "Load more" would append rows above ones already shown.
 */
export const compareActivity = (
  a: Pick<ConversationRow, 'last_message_at' | 'id'>,
  b: Pick<ConversationRow, 'last_message_at' | 'id'>,
) => {
  if (a.last_message_at !== b.last_message_at) {
    if (a.last_message_at === null) {
      return 1;
    }

    if (b.last_message_at === null) {
      return -1;
    }

    const byTime = microseconds(b.last_message_at) - microseconds(a.last_message_at);

    if (byTime !== 0) {
      return byTime;
    }
  }

  // Postgres compares uuids byte by byte, which is the order of their lowercase hex text.
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
};

/** The PostgREST filter that selects everything after `cursor` in the list order. */
export const cursorFilter = (cursor: PageCursor) =>
  cursor.at === null
    ? `and(last_message_at.is.null,id.lt.${cursor.id})`
    : `last_message_at.lt.${cursor.at},and(last_message_at.eq.${cursor.at},id.lt.${cursor.id}),last_message_at.is.null`;

/**
 * One page of conversations plus one row, newest activity first, keyset-paged by
 * (`last_message_at`, `id`). Row level security scopes it to the visitor's own rows on either
 * client. Pass the result through `pageOf`.
 */
export const conversationPage = (
  client: SupabaseClient<Database>,
  assistantId: string,
  filter: ConversationFilter,
  cursor: PageCursor | null = null,
) => {
  let query = client
    .from('conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('assistant_id', assistantId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (filter === 'widget' || filter === 'app') {
    query = query.eq('channel', filter);
  } else if (filter === 'unanswered') {
    query = query.gt('unanswered_count', 0);
  }

  if (cursor) {
    query = query.or(cursorFilter(cursor));
  }

  return query;
};
