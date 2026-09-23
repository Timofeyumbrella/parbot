/**
 * Streams outlive the component that started them: the reader can navigate away and back while
 * an answer arrives, and the thread remounts between the loading fallback and the page. The
 * controllers therefore live here, keyed by conversation, and components subscribe for changes.
 */

const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const streamRegistry = {
  start(conversationId: string) {
    const controller = new AbortController();

    controllers.get(conversationId)?.abort();
    controllers.set(conversationId, controller);
    notify();

    return controller;
  },

  finish(conversationId: string, controller: AbortController) {
    if (controllers.get(conversationId) === controller) {
      controllers.delete(conversationId);
      notify();
    }
  },

  stop(conversationId: string) {
    const controller = controllers.get(conversationId);

    if (!controller) {
      return false;
    }

    controller.abort();
    controllers.delete(conversationId);
    notify();

    return true;
  },

  isStreaming(conversationId: string) {
    return controllers.has(conversationId);
  },

  subscribe(listener: () => void) {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },

  /** Test hook. */
  reset() {
    for (const controller of controllers.values()) {
      controller.abort();
    }

    controllers.clear();
    notify();
  },
};
