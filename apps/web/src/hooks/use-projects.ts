'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { notifyManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

import { createProject, deleteProject, moveConversation, updateProject } from '@/actions/projects';
import type { ConversationRow } from '@/lib/chat/conversations';
import {
  deletedProjects,
  projectCreations,
  projectMoves,
  projectWrites,
} from '@/lib/chat/project-state';
import {
  mergeProjectLists,
  mergeProjectSnapshot,
  moveConversationRow,
  patchProject,
  type ProjectRow,
  type ProjectSnapshot,
  releaseProjectRows,
  removeProject,
  upsertProject,
} from '@/lib/chat/projects';
import { conversationsKey, fetchProjects, INBOX_NAMESPACE, projectsKey } from '@/lib/chat/queries';
import type { MessageReference } from '@/lib/chat/references';
import { composerUploads } from '@/lib/chat/uploads';
import { getSupabaseBrowserClient, realtimeReadyClient } from '@/lib/supabase/client';

/** Said when a server action never answered: the request itself failed. */
const OFFLINE = 'Check your connection and try again.';

/** The newest snapshot folded in per assistant; see `useConversations` for why replays are skipped. */
const appliedSnapshots = new Map<string, number>();

/** Test hook. */
export const resetAppliedProjectSnapshots = () => {
  appliedSnapshots.clear();
};

/**
 * The assistant's projects. The chat layout hands over a snapshot read on the server; from then on
 * the cache is the truth, read again through the browser client when it goes stale or another tab
 * changes a project.
 */
export const useProjects = (assistantId: string, snapshot?: ProjectSnapshot) => {
  const queryClient = useQueryClient();
  const key = projectsKey(assistantId);

  useEffect(() => {
    if (!snapshot || snapshot.fetchedAt <= (appliedSnapshots.get(assistantId) ?? 0)) {
      return;
    }

    appliedSnapshots.set(assistantId, snapshot.fetchedAt);
    queryClient.setQueryData<ProjectRow[]>(projectsKey(assistantId), (rows) =>
      mergeProjectSnapshot(rows, snapshot.rows, deletedProjects.ids()),
    );
  }, [snapshot, assistantId, queryClient]);

  return useQuery({
    queryKey: key,
    queryFn: async () =>
      mergeProjectLists(
        queryClient.getQueryData<ProjectRow[]>(key),
        await fetchProjects(getSupabaseBrowserClient(), assistantId),
        projectWrites.busy(),
        deletedProjects.ids(),
      ),
    initialData: snapshot
      ? () => mergeProjectSnapshot(undefined, snapshot.rows, deletedProjects.ids())
      : undefined,
    initialDataUpdatedAt: snapshot ? Date.now : undefined,
  });
};

/**
 * The list as the sidebar holds it, for screens that show one project (its home, a composer's
 * fixed chips). Never fetches on its own: the sidebar owns the query.
 */
export const useProjectList = (assistantId: string) =>
  useQuery<ProjectRow[]>({
    queryKey: projectsKey(assistantId),
    queryFn: () => fetchProjects(getSupabaseBrowserClient(), assistantId),
    enabled: false,
  }).data;

/** One project from the cache, or null; undefined while the list has not arrived. */
export const useProjectRow = (assistantId: string, projectId: string | null | undefined) => {
  const projects = useProjectList(assistantId);

  if (!projectId) {
    return null;
  }

  return projects ? (projects.find((project) => project.id === projectId) ?? null) : undefined;
};

/**
 * Another tab created, renamed, edited or deleted a project: read the list again. Editing a
 * project's files touches its row, so this one table covers every change.
 */
export const useProjectsRealtime = (assistantId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    void realtimeReadyClient().then((supabase) => {
      if (cancelled) {
        return;
      }

      channel = supabase
        .channel(`chat:projects:${assistantId}:${Math.random().toString(36).slice(2)}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chat_projects',
            filter: `assistant_id=eq.${assistantId}`,
          },
          () => {
            void queryClient.invalidateQueries({ queryKey: projectsKey(assistantId), exact: true });
          },
        )
        .subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(
              `Chat: the projects channel did not join (${status}).`,
              error?.message ?? '',
            );
          }
        });
    });

    return () => {
      cancelled = true;

      if (channel) {
        void getSupabaseBrowserClient().removeChannel(channel);
      }
    };
  }, [assistantId, queryClient]);
};

export type ProjectPatch = {
  name?: string;
  instructions?: string;
  /** The project's files, in order. Files still uploading are sent once they have landed. */
  sources?: MessageReference[];
};

/**
 * Creating, changing and deleting projects, and moving conversations in and out of them. Each one
 * changes the cache first and rolls back with a toast if the server refuses. The Inbox labels
 * conversations with their project, so changes that affect it tell it to read again.
 */
export const useProjectActions = (assistantId: string) => {
  const queryClient = useQueryClient();
  const key = projectsKey(assistantId);
  const listKey = conversationsKey(assistantId);

  const refreshInbox = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: INBOX_NAMESPACE }),
    [queryClient],
  );

  /** Shows the project at once and returns its id; the server catches up behind it. */
  const create = useCallback(
    (name: string) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const trimmed = name.trim();
      const rollback = (error: string) => {
        queryClient.setQueryData<ProjectRow[]>(key, (rows) => removeProject(rows ?? [], id));
        toast.error(error);

        return false;
      };

      queryClient.setQueryData<ProjectRow[]>(key, (rows) =>
        upsertProject(rows ?? [], {
          id,
          name: trimmed,
          instructions: '',
          sources: [],
          created_at: now,
          updated_at: now,
          pending: true,
        }),
      );

      const done = createProject({ id, assistantId, name: trimmed }).then(
        (result) => {
          if (!result.ok) {
            return rollback(result.error);
          }

          // Deleted while it was being created: the delete waits for this and takes it away.
          if (deletedProjects.ids().has(id)) {
            return true;
          }

          queryClient.setQueryData<ProjectRow[]>(key, (rows) =>
            upsertProject(rows ?? [], { ...result.project, pending: false }),
          );

          return true;
        },
        () => rollback(`The project could not be created. ${OFFLINE}`),
      );

      projectCreations.track(id, done);

      return id;
    },
    [queryClient, key, assistantId],
  );

  const update = useCallback(
    async (id: string, patch: ProjectPatch) => {
      const previous = queryClient.getQueryData<ProjectRow[]>(key)?.find((row) => row.id === id);

      if (!previous) {
        return false;
      }

      const undo: Partial<ProjectRow> = {
        ...(patch.name !== undefined ? { name: previous.name } : {}),
        ...(patch.instructions !== undefined ? { instructions: previous.instructions } : {}),
        ...(patch.sources !== undefined ? { sources: previous.sources } : {}),
      };
      const fail = (error: string) => {
        queryClient.setQueryData<ProjectRow[]>(key, (rows) => patchProject(rows ?? [], id, undo));
        toast.error(error);

        return false;
      };

      projectWrites.begin(id);
      queryClient.setQueryData<ProjectRow[]>(key, (rows) =>
        patchProject(rows ?? [], id, {
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.instructions !== undefined ? { instructions: patch.instructions.trim() } : {}),
          ...(patch.sources !== undefined ? { sources: patch.sources } : {}),
        }),
      );

      try {
        if (!(await projectCreations.ready(id))) {
          // The project itself never made it; its creation already rolled back and said why.
          return false;
        }

        let sources = patch.sources;

        if (sources) {
          // Files attached in the dialog land in Knowledge first; one the server refused is left
          // out, and its chip in the dialog said why.
          const uploading = composerUploads.pending(sources.map((source) => source.id));

          if (uploading.length > 0) {
            const saved = await composerUploads.settle(uploading);
            const kept = sources.filter(
              (source) => !uploading.includes(source.id) || saved.has(source.id),
            );

            sources = kept;
            queryClient.setQueryData<ProjectRow[]>(key, (rows) =>
              patchProject(rows ?? [], id, { sources: kept }),
            );
          }
        }

        const result = await updateProject({
          id,
          name: patch.name?.trim(),
          instructions: patch.instructions,
          sourceIds: sources?.map((source) => source.id),
        }).catch(() => ({
          ok: false as const,
          error: `The project could not be saved. ${OFFLINE}`,
        }));

        if (!result.ok) {
          return fail(result.error);
        }

        queryClient.setQueryData<ProjectRow[]>(key, (rows) =>
          upsertProject(rows ?? [], result.project),
        );

        if (patch.name !== undefined) {
          refreshInbox();
        }

        return true;
      } finally {
        projectWrites.end(id);
      }
    },
    [queryClient, key, refreshInbox],
  );

  const rename = useCallback((id: string, name: string) => update(id, { name }), [update]);

  /**
   * The project leaves the list and its conversations move to Chats in one render, before the
   * server answers; reads that left before the delete landed cannot undo either (see
   * `deletedProjects`). Once the server agrees, both lists are read again in the background; if
   * it refuses, the folder and its chats come back.
   */
  const remove = useCallback(
    async (id: string) => {
      const project = queryClient.getQueryData<ProjectRow[]>(key)?.find((row) => row.id === id);
      const released = new Set(
        (queryClient.getQueryData<ConversationRow[]>(listKey) ?? [])
          .filter((row) => row.project_id === id)
          .map((row) => row.id),
      );

      deletedProjects.add(id);
      // One step: a render between the two writes would show the folder gone with its chats not
      // yet under Chats, or the reverse.
      notifyManager.batch(() => {
        queryClient.setQueryData<ProjectRow[]>(key, (rows) => removeProject(rows ?? [], id));
        queryClient.setQueryData<ConversationRow[]>(listKey, (rows) =>
          rows ? releaseProjectRows(rows, id) : rows,
        );
      });

      await projectCreations.ready(id);

      const result = await deleteProject({ id }).catch(() => ({
        ok: false as const,
        error: `The project could not be deleted. ${OFFLINE}`,
      }));

      if (!result.ok) {
        deletedProjects.restore(id);
        notifyManager.batch(() => {
          if (project) {
            queryClient.setQueryData<ProjectRow[]>(key, (rows) =>
              upsertProject(rows ?? [], project),
            );
          }

          queryClient.setQueryData<ConversationRow[]>(listKey, (rows) =>
            rows?.map((row) =>
              released.has(row.id) && !row.project_id ? { ...row, project_id: id } : row,
            ),
          );
        });
        toast.error(result.error);

        return false;
      }

      void queryClient.invalidateQueries({ queryKey: key, exact: true });
      void queryClient.invalidateQueries({ queryKey: listKey, exact: true });
      refreshInbox();

      return true;
    },
    [queryClient, key, listKey, refreshInbox],
  );

  /** Moves a conversation into a project, or out of any with null. */
  const move = useCallback(
    async (conversationId: string, projectId: string | null) => {
      const row = queryClient
        .getQueryData<ConversationRow[]>(listKey)
        ?.find((candidate) => candidate.id === conversationId);
      const from = row?.project_id ?? null;

      if (!row || from === projectId) {
        return true;
      }

      const undo = (error: string | null) => {
        projectMoves.cancel(conversationId);
        queryClient.setQueryData<ConversationRow[]>(listKey, (rows) =>
          rows ? moveConversationRow(rows, conversationId, from) : rows,
        );

        if (error) {
          toast.error(error);
        }

        return false;
      };

      projectMoves.begin(conversationId, projectId);
      queryClient.setQueryData<ConversationRow[]>(listKey, (rows) =>
        rows ? moveConversationRow(rows, conversationId, projectId) : rows,
      );

      if (projectId && !(await projectCreations.ready(projectId))) {
        return undo(null);
      }

      const result = await moveConversation({ conversationId, projectId }).catch(() => ({
        ok: false as const,
        error: `The conversation could not be moved. ${OFFLINE}`,
      }));

      if (!result.ok) {
        return undo(result.error);
      }

      projectMoves.settle(conversationId);
      refreshInbox();

      return true;
    },
    [queryClient, listKey, refreshInbox],
  );

  return useMemo(
    () => ({ create, update, rename, remove, move }),
    [create, update, rename, remove, move],
  );
};
