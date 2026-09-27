/**
 * Unsent composer text, keyed by conversation. The composer remounts when the route's loading
 * boundary hands over to the page, when the route takes over from the pane a click rendered, and
 * when the reader switches conversations; what they typed, and the focus they typed it with,
 * should not go with it. Held in memory only: a reload starts clean.
 */

import type { MessageReference } from './references';

const drafts = new Map<string, string>();

export const NEW_CHAT_DRAFT = 'new';

export const readDraft = (key: string) => drafts.get(key) ?? '';

export const writeDraft = (key: string, value: string) => {
  if (value) {
    drafts.set(key, value);
  } else {
    drafts.delete(key);
  }
};

export const clearDraft = (key: string) => {
  drafts.delete(key);
};

type FocusHandoff = { key: string; start: number; end: number };

let handoff: FocusHandoff | null = null;

/**
 * Called by a focused composer as it unmounts. When the one replacing it (same conversation) mounts
 * in the same commit, it takes the focus and the caret from here. A handoff nobody claims by the
 * end of the task is dropped: the reader left the chat, and a later visit must not steal focus.
 */
export const handOffFocus = (key: string, start: number, end: number) => {
  const offered = { key, start, end };

  handoff = offered;
  queueMicrotask(() => {
    if (handoff === offered) {
      handoff = null;
    }
  });
};

/** The focus a composer for this conversation handed over in this commit, if any. */
export const takeFocus = (key: string): FocusHandoff | null => {
  const taken = handoff?.key === key ? handoff : null;

  if (taken) {
    handoff = null;
  }

  return taken;
};

/**
 * The reference chips the reader set up in a composer but has not sent yet, by the same key as the
 * text. None stored means the composer shows the conversation's own references.
 */
const referenceDrafts = new Map<string, MessageReference[]>();

export const readReferenceDraft = (key: string) => referenceDrafts.get(key) ?? null;

export const writeReferenceDraft = (key: string, references: MessageReference[] | null) => {
  if (references) {
    referenceDrafts.set(key, references);
  } else {
    referenceDrafts.delete(key);
  }
};

/** Test hook. */
export const resetDrafts = () => {
  drafts.clear();
  referenceDrafts.clear();
  handoff = null;
};
