/**
 * Unsent composer text, keyed by conversation. The composer remounts when the route's loading
 * boundary hands over to the page and when the reader switches conversations; what they typed
 * should not go with it. Held in memory only: a reload starts clean.
 */

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

/** Test hook. */
export const resetDrafts = () => {
  drafts.clear();
};
