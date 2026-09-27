import type { ConversationRow } from './conversations';

/**
 * What the browser knows about projects that the server does not know yet. Module state, like the
 * upload registry: a project created a moment ago can be sent to from a screen that mounted after
 * the one that created it, and a move made in one pane must hold in the other.
 */

const creations = new Map<string, Promise<boolean>>();

export const projectCreations = {
  /** Records a project being created; `done` resolves true once it exists on the server. */
  track: (id: string, done: Promise<boolean>) => {
    // A project that was created is simply there from then on; one that failed stays known as
    // failed, so a send that starts after the failure does not go out in its name.
    creations.set(id, done);
    done.then(
      (created) => {
        if (created && creations.get(id) === done) {
          creations.delete(id);
        }
      },
      () => undefined,
    );
  },
  /** Resolves true once the project exists (at once if nothing is in flight), false if it failed. */
  ready: (id: string) => creations.get(id) ?? Promise.resolve(true),
};

/** How long a settled move still wins over a server row that says otherwise. */
export const MOVE_GRACE_MS = 5_000;

type Move = { projectId: string | null; settledAt: number | null };

const moves = new Map<string, Move>();

/**
 * Moves in flight. A realtime event or a list read that left the server before a move landed
 * still carries the old project; applied as is, it would put the conversation back for a moment.
 * While a move is in flight, and shortly after, the reader's choice wins; a server row that
 * agrees with it ends the override early.
 */
export const projectMoves = {
  begin: (conversationId: string, projectId: string | null) => {
    moves.set(conversationId, { projectId, settledAt: null });
  },
  settle: (conversationId: string) => {
    const move = moves.get(conversationId);

    if (move) {
      moves.set(conversationId, { ...move, settledAt: Date.now() });
    }
  },
  cancel: (conversationId: string) => {
    moves.delete(conversationId);
  },
  /** The rows with every move still in effect applied over them. */
  overlay: (rows: ConversationRow[], now = Date.now()) => {
    if (moves.size === 0) {
      return rows;
    }

    return rows.map((row) => {
      const move = moves.get(row.id);

      if (!move) {
        return row;
      }

      const agrees = (row.project_id ?? null) === move.projectId;

      if (move.settledAt !== null && (agrees || now - move.settledAt > MOVE_GRACE_MS)) {
        moves.delete(row.id);

        return row;
      }

      return agrees ? row : { ...row, project_id: move.projectId };
    });
  },
};

const writes = new Map<string, number>();

/** Projects with a change on its way to the server; a read that predates it must not undo it. */
export const projectWrites = {
  begin: (id: string) => writes.set(id, (writes.get(id) ?? 0) + 1),
  end: (id: string) => {
    const count = (writes.get(id) ?? 1) - 1;

    if (count > 0) {
      writes.set(id, count);
    } else {
      writes.delete(id);
    }
  },
  busy: (): ReadonlySet<string> => new Set(writes.keys()),
};

const deleted = new Set<string>();

/**
 * Projects deleted here. A read, a snapshot or a realtime row that left the server before the
 * delete landed must not bring the folder back, nor put its chats back in it: the reader saw them
 * move to Chats the moment they confirmed.
 */
export const deletedProjects = {
  add: (id: string) => deleted.add(id),
  restore: (id: string) => deleted.delete(id),
  ids: (): ReadonlySet<string> => deleted,
  /** The rows with every chat of a deleted project moved out of it. */
  release: (rows: ConversationRow[]) =>
    deleted.size > 0 && rows.some((row) => row.project_id && deleted.has(row.project_id))
      ? rows.map((row) =>
          row.project_id && deleted.has(row.project_id) ? { ...row, project_id: null } : row,
        )
      : rows,
};

/**
 * What the browser knows about projects that the server may not have applied yet, laid over
 * server rows: moves in flight, then deleted projects.
 */
export const overlayProjectState = (rows: ConversationRow[], now = Date.now()) =>
  deletedProjects.release(projectMoves.overlay(rows, now));

/** Test hook. */
export const resetProjectState = () => {
  creations.clear();
  moves.clear();
  writes.clear();
  deleted.clear();
};
