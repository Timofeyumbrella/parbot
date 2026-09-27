import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/db/types';

import {
  CONVERSATION_COLUMNS,
  CONVERSATION_LIST_LIMIT,
  type ConversationRow,
  type ConversationSnapshot,
} from './conversations';
import {
  PROJECT_COLUMNS,
  projectFromRow,
  type ProjectRow,
  type ProjectSnapshot,
  sortProjects,
} from './projects';
import { mergeThread, type MessageRow, type Thread, THREAD_MESSAGE_COLUMNS } from './thread';

type Client = SupabaseClient<Database>;

/**
 * Every chat query lives under one namespace, so no other screen can collide with the shapes
 * stored here, and the whole chat cache can be dropped in one call.
 */
export const CHAT_NAMESPACE = ['chat'] as const;

/** The inbox keeps its own conversation caches; a chat mutation tells it to refetch. */
export const INBOX_NAMESPACE = ['inbox'] as const;

export const conversationsKey = (assistantId: string) =>
  [...CHAT_NAMESPACE, 'conversations', assistantId] as const;
export const threadKey = (conversationId: string) =>
  [...CHAT_NAMESPACE, 'thread', conversationId] as const;
export const projectsKey = (assistantId: string) =>
  [...CHAT_NAMESPACE, 'projects', assistantId] as const;

/** The assistant's projects with their files, newest first. Works with the server and the browser client. */
export const fetchProjects = async (client: Client, assistantId: string): Promise<ProjectRow[]> => {
  const { data, error } = await client
    .from('chat_projects')
    .select(PROJECT_COLUMNS)
    .eq('assistant_id', assistantId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return sortProjects((data ?? []).map(projectFromRow));
};

/** The projects plus the clock they were read at, like the conversation snapshot. */
export const readProjectSnapshot = async (
  client: Client,
  assistantId: string,
): Promise<ProjectSnapshot> => ({
  rows: await fetchProjects(client, assistantId),
  fetchedAt: Date.now(),
});

/** The assistant's in-app conversations, newest first. Works with the server and the browser client. */
export const fetchConversations = async (
  client: Client,
  assistantId: string,
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

  return data ?? [];
};

/** The list plus the clock it was read at, so the client can tell a newer snapshot from a replay. */
export const readConversationSnapshot = async (
  client: Client,
  assistantId: string,
): Promise<ConversationSnapshot> => {
  const rows = await fetchConversations(client, assistantId);

  return { rows, fetchedAt: Date.now() };
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
