/** The conversation list cache and the pure transitions the chat applies to it. */

export type ConversationRow = {
  id: string;
  title: string | null;
  last_message_at: string | null;
  message_count: number;
  unanswered_count: number;
  /** Created in the browser and not yet confirmed by the server. */
  pending?: boolean;
};

export const CONVERSATION_COLUMNS = 'id, title, last_message_at, message_count, unanswered_count';
export const CONVERSATION_LIST_LIMIT = 100;
export const TITLE_LIMIT = 60;
export const MAX_TITLE_LENGTH = 120;

/** Same rule the engine applies when it names a conversation, so the optimistic row matches. */
export const draftTitle = (message: string) => {
  const line = message.replace(/\s+/g, ' ').trim();

  if (line.length <= TITLE_LIMIT) {
    return line;
  }

  const cut = line.slice(0, TITLE_LIMIT);
  const lastSpace = cut.lastIndexOf(' ');

  return `${cut.slice(0, lastSpace > TITLE_LIMIT - 20 ? lastSpace : cut.length).trimEnd()}…`;
};

const activity = (row: ConversationRow) => (row.last_message_at ? Date.parse(row.last_message_at) : -1);

/** Newest activity first; rows that never had a message sink to the bottom. */
export const sortConversations = (rows: ConversationRow[]) =>
  [...rows].sort((a, b) => activity(b) - activity(a));

export const upsertConversation = (rows: ConversationRow[], row: ConversationRow) => {
  const index = rows.findIndex((existing) => existing.id === row.id);
  const next = index === -1 ? [row, ...rows] : rows.map((existing) => (existing.id === row.id ? { ...existing, ...row } : existing));

  return sortConversations(next);
};

/**
 * A row from the server replaces what the cache holds, except that a pending row keeps its
 * optimistic title until the server has one.
 */
export const applyServerRow = (rows: ConversationRow[], row: ConversationRow) => {
  const existing = rows.find((candidate) => candidate.id === row.id);
  const merged: ConversationRow = {
    ...row,
    title: row.title ?? existing?.title ?? null,
    pending: false,
  };

  return upsertConversation(rows, merged);
};

export const renameConversationRow = (rows: ConversationRow[], id: string, title: string) =>
  rows.map((row) => (row.id === id ? { ...row, title } : row));

export const removeConversationRow = (rows: ConversationRow[], id: string) =>
  rows.filter((row) => row.id !== id);

/** Marks the row confirmed once the server has created it. */
export const confirmConversation = (rows: ConversationRow[], id: string) =>
  rows.map((row) => (row.id === id && row.pending ? { ...row, pending: false } : row));

/** Rows created optimistically must survive a refetch that predates them. */
export const mergeConversationLists = (previous: ConversationRow[] | undefined, fetched: ConversationRow[]) => {
  if (!previous) {
    return sortConversations(fetched);
  }

  const known = new Set(fetched.map((row) => row.id));
  const pending = previous.filter((row) => row.pending && !known.has(row.id));

  return sortConversations([...pending, ...fetched]);
};

/** Case-insensitive title filter used by the list's search box. */
export const filterConversations = (rows: ConversationRow[], query: string) => {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return rows;
  }

  return rows.filter((row) => (row.title ?? 'New chat').toLowerCase().includes(needle));
};

export const conversationLabel = (row: Pick<ConversationRow, 'title'>) => row.title?.trim() || 'New chat';
