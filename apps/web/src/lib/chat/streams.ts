/**
 * Streams outlive the component that started them: the reader can navigate away and back while
 * an answer arrives, and the thread remounts between the loading fallback and the page. The
 * controllers therefore live here, keyed by conversation, and components subscribe for changes.
 */

/** The answer a stream is writing: its assistant and the id it will be saved under. */
export type StreamTarget = { assistantId: string; messageId: string };

type Entry = { controller: AbortController; target: StreamTarget | null };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const streamRegistry = {
  start(conversationId: string, target: StreamTarget | null = null) {
    const controller = new AbortController();

    entries.get(conversationId)?.controller.abort();
    entries.set(conversationId, { controller, target });
    notify();

    return controller;
  },

  finish(conversationId: string, controller: AbortController) {
    if (entries.get(conversationId)?.controller === controller) {
      entries.delete(conversationId);
      notify();
    }
  },

  stop(conversationId: string) {
    const entry = entries.get(conversationId);

    if (!entry) {
      return false;
    }

    entry.controller.abort();
    entries.delete(conversationId);
    notify();

    return true;
  },

  /** The answer the conversation's stream is writing, so a Stop can name it to the server. */
  target(conversationId: string) {
    return entries.get(conversationId)?.target ?? null;
  },

  isStreaming(conversationId: string) {
    return entries.has(conversationId);
  },

  subscribe(listener: () => void) {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },

  /** Test hook. */
  reset() {
    for (const entry of entries.values()) {
      entry.controller.abort();
    }

    entries.clear();
    notify();
  },
};
