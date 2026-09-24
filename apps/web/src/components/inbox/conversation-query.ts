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
  'id, title, channel, page_url, message_count, unanswered_count, last_message_at, created_at' as const;

export type ConversationRow = Pick<
  Conversation,
  'id' | 'title' | 'channel' | 'page_url' | 'message_count' | 'unanswered_count' | 'last_message_at' | 'created_at'
>;

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

/** The moment a row is sorted by: its last message, or its start while it has none. */
export const activityStamp = (row: Pick<ConversationRow, 'last_message_at' | 'created_at'>) =>
  row.last_message_at ?? row.created_at;

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
