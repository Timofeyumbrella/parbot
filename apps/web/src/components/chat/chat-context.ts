'use client';

import { createContext, useContext } from 'react';

/**
 * What the chat shell tells the screens inside it. Kept apart from the shell so a screen the shell
 * renders (a project's home) can read it without importing the shell back.
 */

export type ChatPane = { onNavigate?: () => void };

export const ChatPaneContext = createContext<ChatPane>({});

/** What the pane a conversation list sits in wants to know: on a phone, that a link was followed. */
export const useChatPane = () => useContext(ChatPaneContext);

export type ChatSelection = {
  /** The conversation on screen: the one just clicked, else the route's. Null is a new chat. */
  selectedId: string | null;
  /** The project whose home is on screen, when one is; null otherwise. */
  selectedProjectId: string | null;
  /** Shows a conversation (or a new chat, with null) at once; the link's navigation follows. */
  select: (conversationId: string | null) => void;
  /** Shows a project's home at once, ready for a new chat in it; the link's navigation follows. */
  selectProject: (projectId: string) => void;
};

export const ChatSelectionContext = createContext<ChatSelection | null>(null);

/** The shell's selection, or null outside a shell (the list then follows the route alone). */
export const useChatSelection = () => useContext(ChatSelectionContext);
