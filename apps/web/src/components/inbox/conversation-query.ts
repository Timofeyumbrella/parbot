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

/** The TanStack key for one filter's list, or the prefix for every list of an assistant. */
export const conversationListKey = (assistantId: string, filter?: ConversationFilter) =>
  filter ? (['conversations', assistantId, filter] as const) : (['conversations', assistantId] as const);

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

/** The cursor for the next page: rows without a message sit last, so a null cursor ends paging. */
export const nextCursor = (rows: ConversationRow[]) =>
  rows.length === PAGE_SIZE ? (rows[rows.length - 1]?.last_message_at ?? null) : null;

/** The moment a row is sorted by: its last message, or its start while it has none. */
export const activityStamp = (row: Pick<ConversationRow, 'last_message_at' | 'created_at'>) =>
  row.last_message_at ?? row.created_at;

/**
 * One page of conversations, newest activity first, keyset-paged by `last_message_at`.
 * Row level security scopes it to the visitor's own rows on either client.
 */
export const conversationPage = (
  client: SupabaseClient<Database>,
  assistantId: string,
  filter: ConversationFilter,
  cursor: string | null = null,
) => {
  let query = client
    .from('conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('assistant_id', assistantId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (filter === 'widget' || filter === 'app') {
    query = query.eq('channel', filter);
  } else if (filter === 'unanswered') {
    query = query.gt('unanswered_count', 0);
  }

  if (cursor) {
    query = query.lt('last_message_at', cursor);
  }

  return query;
};
