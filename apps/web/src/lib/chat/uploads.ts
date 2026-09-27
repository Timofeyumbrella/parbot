import type { Source } from '@/lib/db';
import { UPLOAD_FAILED_OFFLINE } from '@/lib/uploads';

import type { UploadState } from './references';

/**
 * Files attached from the chat composer, uploaded into the assistant's Knowledge through the same
 * route the Add source dialog uses (so the plan's page limit and the 25 MB and type rules hold).
 * Module state, not component state: the composer remounts when a new chat moves to its own URL,
 * and a question sent while its file is still uploading waits for the upload wherever it is.
 */

type Entry = {
  state: UploadState;
  done: Promise<Source | null>;
  /** What was sent, so the same file attached again joins this upload instead of starting one. */
  file: { assistantId: string; name: string; size: number };
};

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;

const notify = () => {
  version += 1;

  for (const listener of listeners) {
    listener();
  }
};

const set = (id: string, state: UploadState) => {
  const entry = entries.get(id);

  if (entry) {
    entries.set(id, { ...entry, state });
    notify();
  }
};

export type UploadInput = { id: string; assistantId: string; file: File };

export type UploadOptions = {
  /** Called with the saved row, so the screens that list sources can show it straight away. */
  onSaved?: (source: Source) => void;
  onFailed?: (error: string) => void;
};

/** Posts the file as the Add source dialog does: multipart, with the id the chip already uses. */
const post = async ({ id, assistantId, file }: UploadInput) => {
  const body = new FormData();

  body.set('assistantId', assistantId);
  body.set('id', id);
  body.set('file', file);

  const response = await fetch('/api/sources', { method: 'POST', body });
  const payload = (await response.json().catch(() => null)) as {
    source?: Source;
    error?: string;
  } | null;

  if (!response.ok || !payload?.source) {
    throw new Error(payload?.error ?? `The upload failed (HTTP ${response.status}). Try again.`);
  }

  return payload.source;
};

export const composerUploads = {
  /** Starts an upload; resolves with the saved row, or null when the server refused it. */
  start: (input: UploadInput, options: UploadOptions = {}) => {
    const done = post(input).then(
      (source) => {
        set(input.id, { status: 'saved' });
        options.onSaved?.(source);

        return source;
      },
      (cause: unknown) => {
        const error =
          cause instanceof TypeError
            ? UPLOAD_FAILED_OFFLINE
            : cause instanceof Error
              ? cause.message
              : UPLOAD_FAILED_OFFLINE;

        set(input.id, { status: 'failed', error });
        options.onFailed?.(error);

        return null;
      },
    );

    entries.set(input.id, {
      state: { status: 'uploading' },
      done,
      file: { assistantId: input.assistantId, name: input.file.name, size: input.file.size },
    });
    notify();

    return done;
  },

  /**
   * The upload of this same file (name and size) into this assistant that is still on its way, if
   * any. Once saved, the source list knows the file (and forgets it if it is deleted later).
   */
  find: (assistantId: string, file: { name: string; size: number }) => {
    for (const [id, entry] of entries) {
      if (
        entry.state.status === 'uploading' &&
        entry.file.assistantId === assistantId &&
        entry.file.name === file.name &&
        entry.file.size === file.size
      ) {
        return id;
      }
    }

    return null;
  },

  state: (id: string): UploadState | undefined => entries.get(id)?.state,

  /** Resolves once every listed upload has finished, with the ids that were saved. */
  settle: async (ids: string[]) => {
    const results = await Promise.all(
      ids.map(async (id) => {
        const entry = entries.get(id);

        if (!entry) {
          return { id, saved: true };
        }

        return { id, saved: (await entry.done) !== null };
      }),
    );

    return new Set(results.filter((result) => result.saved).map((result) => result.id));
  },

  pending: (ids: string[]) => ids.filter((id) => entries.get(id)?.state.status === 'uploading'),

  subscribe: (listener: () => void) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },

  /** Changes whenever an upload's state does, for useSyncExternalStore. */
  version: () => version,

  /** Test hook. */
  reset: () => {
    entries.clear();
    notify();
  },
};
