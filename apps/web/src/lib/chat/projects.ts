import type { ConversationRow } from './conversations';
import { type MessageReference, parseReferences } from './references';

/**
 * Projects: folders in the chat sidebar, like projects in ChatGPT. A project groups conversations
 * and carries files and instructions that every conversation inside it answers with. Pure helpers
 * and limits, shared by the sidebar, the project dialog, the server actions and the engine.
 */

export const MAX_PROJECT_NAME = 60;
export const MAX_PROJECT_INSTRUCTIONS = 4000;
/** The most files one project holds. Every question in the project reads each of them. */
export const MAX_PROJECT_SOURCES = 20;

export type ProjectRow = {
  id: string;
  name: string;
  instructions: string;
  /** The project's files, in the order they were added. */
  sources: MessageReference[];
  created_at: string;
  updated_at: string;
  /** Created in the browser and not yet confirmed by the server. */
  pending?: boolean;
};

/** What the chat layout hands the client: the rows and the server clock when they were read. */
export type ProjectSnapshot = { rows: ProjectRow[]; fetchedAt: number };

export const PROJECT_COLUMNS =
  'id, name, instructions, created_at, updated_at, project_sources(position, sources(id, title, kind))';

type ProjectQueryRow = {
  id: string;
  name: string;
  instructions: string;
  created_at: string;
  updated_at: string;
  project_sources: {
    position: number;
    sources: { id: string; title: string; kind: string } | null;
  }[];
};

/** A row as the database returns it, with its files flattened in their order. */
export const projectFromRow = (row: ProjectQueryRow): ProjectRow => ({
  id: row.id,
  name: row.name,
  instructions: row.instructions,
  created_at: row.created_at,
  updated_at: row.updated_at,
  sources: parseReferences(
    [...row.project_sources]
      .sort((a, b) => a.position - b.position)
      .flatMap((entry) => (entry.sources ? [entry.sources] : [])),
  ),
});

/** Newest first, the way the sidebar lists them. */
export const sortProjects = (rows: ProjectRow[]) =>
  [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

export const upsertProject = (rows: ProjectRow[], row: ProjectRow) =>
  sortProjects(
    rows.some((existing) => existing.id === row.id)
      ? rows.map((existing) => (existing.id === row.id ? { ...existing, ...row } : existing))
      : [row, ...rows],
  );

export const patchProject = (rows: ProjectRow[], id: string, patch: Partial<ProjectRow>) =>
  rows.map((row) => (row.id === id ? { ...row, ...patch } : row));

export const removeProject = (rows: ProjectRow[], id: string) =>
  rows.filter((row) => row.id !== id);

/**
 * Reconciles a fresh read with the cache. The server wins, including projects deleted elsewhere;
 * only projects created here and not yet confirmed survive a read that predates them, and a
 * project with a change still on its way (`busy`) keeps what the reader sees until it lands.
 */
export const mergeProjectLists = (
  previous: ProjectRow[] | undefined,
  fetched: ProjectRow[],
  busy: ReadonlySet<string> = new Set(),
) => {
  const cached = new Map((previous ?? []).map((row) => [row.id, row]));
  const known = new Set(fetched.map((row) => row.id));
  const pending = (previous ?? []).filter((row) => row.pending && !known.has(row.id));
  const merged = fetched.map((row) => (busy.has(row.id) ? (cached.get(row.id) ?? row) : row));

  return sortProjects([...pending, ...merged]);
};

/**
 * Folds a server snapshot into the cache, like the conversation list does: it adds and updates
 * (a cached copy that is newer, or still pending, wins) and never drops, and it never brings back
 * a project the reader deleted here.
 */
export const mergeProjectSnapshot = (
  previous: ProjectRow[] | undefined,
  snapshot: ProjectRow[],
  deleted: ReadonlySet<string> = new Set(),
) => {
  const incoming = snapshot.filter((row) => !deleted.has(row.id));

  if (!previous) {
    return sortProjects(incoming);
  }

  const fresh = new Map(incoming.map((row) => [row.id, row]));
  const merged = previous.map((row) => {
    const next = fresh.get(row.id);

    return next && !row.pending && next.updated_at >= row.updated_at ? next : row;
  });
  const cached = new Set(previous.map((row) => row.id));

  return sortProjects([...merged, ...incoming.filter((row) => !cached.has(row.id))]);
};

/** Why a name cannot be used, or null. Names are unique per assistant, whatever the case. */
export const projectNameProblem = (
  name: string,
  projects: Pick<ProjectRow, 'id' | 'name'>[],
  exceptId?: string,
) => {
  const trimmed = name.trim();

  if (!trimmed) {
    return 'Give the project a name.';
  }

  if (trimmed.length > MAX_PROJECT_NAME) {
    return `Keep the name under ${MAX_PROJECT_NAME + 1} characters.`;
  }

  const lower = trimmed.toLowerCase();

  if (projects.some((project) => project.id !== exceptId && project.name.toLowerCase() === lower)) {
    return `There is already a project called “${trimmed}”.`;
  }

  return null;
};

/**
 * The conversations of each project, and the ones in none. A conversation whose project is not in
 * the list (deleted in another tab a moment ago) shows with the ones in none.
 */
export const groupConversations = (rows: ConversationRow[], projects: Pick<ProjectRow, 'id'>[]) => {
  const ids = new Set(projects.map((project) => project.id));
  const byProject = new Map<string, ConversationRow[]>();
  const loose: ConversationRow[] = [];

  for (const row of rows) {
    const projectId = row.project_id ?? null;

    if (projectId && ids.has(projectId)) {
      const list = byProject.get(projectId) ?? [];

      list.push(row);
      byProject.set(projectId, list);
    } else {
      loose.push(row);
    }
  }

  return { byProject, loose };
};

/** Moves a conversation into a project, or out of any with null. */
export const moveConversationRow = (
  rows: ConversationRow[],
  conversationId: string,
  projectId: string | null,
) => rows.map((row) => (row.id === conversationId ? { ...row, project_id: projectId } : row));

/** Every conversation of a deleted project moves out of it. */
export const releaseProjectRows = (rows: ConversationRow[], projectId: string) =>
  rows.map((row) => (row.project_id === projectId ? { ...row, project_id: null } : row));

/** The first lines of the instructions, for the project's home. */
export const instructionsSummary = (instructions: string, limit = 220) => {
  const text = instructions.replace(/\s+/g, ' ').trim();

  if (text.length <= limit) {
    return text;
  }

  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');

  return `${cut.slice(0, lastSpace > limit - 40 ? lastSpace : limit).trimEnd()}…`;
};
