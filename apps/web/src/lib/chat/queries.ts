import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/db/types';

import {
  CONVERSATION_COLUMNS,
  CONVERSATION_LIST_LIMIT,
  type ConversationRow,
  mergeConversationLists,
} from './conversations';
import { mergeThread, type MessageRow, type Thread, THREAD_MESSAGE_COLUMNS } from './thread';

type Client = SupabaseClient<Database>;

export const conversationsKey = (assistantId: string) => ['conversations', assistantId, 'app'] as const;
export const threadKey = (conversationId: string) => ['thread', conversationId] as const;

/** The assistant's in-app conversations, newest first. Works with the server and the browser client. */
export const fetchConversations = async (
  client: Client,
  assistantId: string,
  previous?: ConversationRow[],
): Promise<ConversationRow[]> => {
  const { data, error } = await client
    .from('conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('assistant_id', assistantId)
    .eq('channel', 'app')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(CONVERSATION_LIST_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  return mergeConversationLists(previous, data ?? []);
};

/** A conversation's messages oldest first, merged with whatever the cache holds in flight. */
export const fetchThread = async (
  client: Client,
  conversationId: string,
  previous?: () => Thread | undefined,
): Promise<Thread> => {
  const { data, error } = await client
    .from('messages')
    .select(THREAD_MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  // Read the cache after the round trip so tokens that arrived meanwhile are not overwritten.
  return mergeThread(previous?.(), (data ?? []) as MessageRow[]);
};
