import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationRow } from '@/lib/chat/conversations';
import { resetProjectState } from '@/lib/chat/project-state';
import { groupConversations, type ProjectRow } from '@/lib/chat/projects';
import { conversationsKey, projectsKey } from '@/lib/chat/queries';

import { resetAppliedSnapshots, useConversations } from './use-conversations';
import { resetAppliedProjectSnapshots, useProjectActions, useProjects } from './use-projects';

type Result = { ok: true } | { ok: false; error: string };

const actions = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  moveConversation: vi.fn(),
}));

/** What the browser client reads: the server's rows, which lag behind the reader's delete. */
const db = vi.hoisted(() => ({
  projects: [] as unknown[],
  conversations: [] as unknown[],
  reads: { chat_projects: 0, conversations: 0 } as Record<string, number>,
}));

vi.mock('@/actions/projects', () => actions);
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/supabase/client', () => {
  const query = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => {
        db.reads[table] = (db.reads[table] ?? 0) + 1;
        resolve({
          data: table === 'chat_projects' ? db.projects : db.conversations,
          error: null,
        });
      },
    };

    return builder;
  };

  return {
    getSupabaseBrowserClient: () => ({ from: query }),
    realtimeReadyClient: () => new Promise(() => {}),
  };
});

const ASSISTANT = 'asst';
const NOW = Date.parse('2026-09-23T12:00:00.000Z');

const project = (id: string, name: string): ProjectRow => ({
  id,
  name,
  instructions: '',
  sources: [],
  created_at: '2026-09-20T10:00:00.000Z',
  updated_at: '2026-09-20T10:00:00.000Z',
});

/** A project as the database returns it, with its files joined in. */
const projectRow = (row: ProjectRow) => ({
  id: row.id,
  name: row.name,
  instructions: row.instructions,
  created_at: row.created_at,
  updated_at: row.updated_at,
  project_sources: [],
});

const chat = (id: string, projectId: string | null, minutesAgo: number): ConversationRow => ({
  id,
  title: id,
  last_message_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
  message_count: 2,
  unanswered_count: 0,
  project_id: projectId,
});

const PROJECTS = [project('p1', 'Billing')];
const ROWS = [chat('c1', 'p1', 1), chat('c2', null, 2), chat('c3', 'p1', 3), chat('c4', null, 4)];

/** What each render of the sidebar showed: folders and the chats listed under Chats. */
type Frame = { folders: string[]; loose: string[] };

let queryClient: QueryClient;
let frames: Frame[];
/** The sidebar's delete, as the confirm button calls it. */
const handle: { remove: (id: string) => Promise<boolean> } = {
  remove: () => Promise.resolve(false),
};
const remove = (id: string) => handle.remove(id);

const Sidebar = () => {
  const { data: rows } = useConversations(ASSISTANT, { rows: ROWS, fetchedAt: NOW });
  const { data: projects } = useProjects(ASSISTANT, { rows: PROJECTS, fetchedAt: NOW });
  const actionsFor = useProjectActions(ASSISTANT);
  const { loose } = groupConversations(rows ?? [], projects ?? []);

  useEffect(() => {
    handle.remove = actionsFor.remove;
  }, [actionsFor]);
  frames.push({
    folders: (projects ?? []).map((row) => row.id),
    loose: loose.map((row) => row.id),
  });

  return null;
};

const renderSidebar = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <Sidebar />
    </QueryClientProvider>,
  );

const deferred = () => {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
};

const cachedRows = () => queryClient.getQueryData<ConversationRow[]>(conversationsKey(ASSISTANT));
const cachedProjects = () => queryClient.getQueryData<ProjectRow[]>(projectsKey(ASSISTANT));
const last = () => frames[frames.length - 1]!;

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  frames = [];
  db.projects = PROJECTS.map(projectRow);
  db.conversations = ROWS;
  db.reads = { chat_projects: 0, conversations: 0 };
  resetAppliedSnapshots();
  resetAppliedProjectSnapshots();
  resetProjectState();
});

describe('deleting a project', () => {
  it('removes the folder and moves its chats to Chats in one render', async () => {
    const pending = deferred();

    actions.deleteProject.mockReturnValueOnce(pending.promise);
    renderSidebar();

    expect(last()).toEqual({ folders: ['p1'], loose: ['c2', 'c4'] });

    const before = frames.length;

    const end = { folders: [], loose: ['c1', 'c2', 'c3', 'c4'] };

    await act(async () => {
      void remove('p1');
    });
    await waitFor(() => expect(last()).toEqual(end));

    // Every render after the click shows the end state: never the folder gone with Chats still
    // short of its chats, nor its chats under Chats beside a folder that is still there.
    const after = frames.slice(before);

    expect(after).toEqual(after.map(() => end));
    expect(actions.deleteProject).toHaveBeenCalledWith({ id: 'p1' });

    await act(async () => {
      pending.resolve({ ok: true });
    });
  });

  it('keeps the folder gone and its chats under Chats while reads that predate the delete land', async () => {
    const pending = deferred();

    actions.deleteProject.mockReturnValueOnce(pending.promise);
    renderSidebar();

    await act(async () => {
      void remove('p1');
    });

    // A realtime event or a focus refetch reads the server before the delete has landed there.
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: projectsKey(ASSISTANT), exact: true });
      await queryClient.invalidateQueries({ queryKey: conversationsKey(ASSISTANT), exact: true });
    });

    expect(db.reads.chat_projects).toBeGreaterThan(0);
    expect(db.reads.conversations).toBeGreaterThan(0);
    expect(cachedProjects()).toEqual([]);
    expect(cachedRows()!.map((row) => row.project_id)).toEqual([null, null, null, null]);
    expect(last()).toEqual({ folders: [], loose: ['c1', 'c2', 'c3', 'c4'] });

    await act(async () => {
      pending.resolve({ ok: true });
    });
  });

  it('reads both lists again in the background once the server agrees', async () => {
    renderSidebar();
    actions.deleteProject.mockImplementationOnce(async () => {
      // The server has applied it by the time it answers.
      db.projects = [];
      db.conversations = ROWS.map((row) => ({ ...row, project_id: null }));

      return { ok: true };
    });

    const reads = { ...db.reads };

    await act(async () => {
      await remove('p1');
    });

    await waitFor(() => {
      expect(db.reads.chat_projects).toBeGreaterThan(reads.chat_projects!);
      expect(db.reads.conversations).toBeGreaterThan(reads.conversations!);
    });
    expect(last()).toEqual({ folders: [], loose: ['c1', 'c2', 'c3', 'c4'] });
  });

  it('puts the folder and its chats back in one render when the server refuses', async () => {
    const pending = deferred();

    actions.deleteProject.mockReturnValueOnce(pending.promise);
    renderSidebar();

    await act(async () => {
      void remove('p1');
    });

    await waitFor(() => expect(last().folders).toEqual([]));

    const before = frames.length;
    const restored = { folders: ['p1'], loose: ['c2', 'c4'] };

    await act(async () => {
      pending.resolve({ ok: false, error: 'The project could not be deleted. Try again.' });
    });
    await waitFor(() => expect(last()).toEqual(restored));

    const after = frames.slice(before);

    expect(after).toEqual(after.map(() => restored));
    expect(cachedRows()!.map((row) => row.project_id)).toEqual(['p1', null, 'p1', null]);
    expect(toast.error).toHaveBeenCalledWith('The project could not be deleted. Try again.');

    // Restored for good: a later read keeps the folder and its chats in it.
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: projectsKey(ASSISTANT), exact: true });
      await queryClient.invalidateQueries({ queryKey: conversationsKey(ASSISTANT), exact: true });
    });
    expect(last()).toEqual({ folders: ['p1'], loose: ['c2', 'c4'] });
  });
});
