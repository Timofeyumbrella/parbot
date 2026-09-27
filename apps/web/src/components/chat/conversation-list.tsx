'use client';

import { cn } from 'cn';
import { Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useChatPane, useChatSelection } from '@/components/chat/chat-context';
import { ConversationRowItem } from '@/components/chat/conversation-row';
import { ProjectDialog, useProjectDialog } from '@/components/chat/project-dialog';
import {
  ProjectsSection,
  setFolderOpen,
  useConversationDrop,
} from '@/components/chat/project-list';
import { isPlainLeftClick } from '@/components/nav-pending';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useConversationActions, useConversations } from '@/hooks/use-conversations';
import { useProjectActions, useProjects } from '@/hooks/use-projects';
import { usePrefetchThread } from '@/hooks/use-thread';
import {
  conversationLabel,
  type ConversationRow,
  type ConversationSnapshot,
  filterConversations,
} from '@/lib/chat/conversations';
import { groupConversations, type ProjectRow, type ProjectSnapshot } from '@/lib/chat/projects';

export type ConversationListProps = {
  assistantId: string;
  /** The first page, read by the server; seeds the cache. */
  snapshot?: ConversationSnapshot;
  /** The projects, read by the server alongside; seeds their cache. */
  projectSnapshot?: ProjectSnapshot;
};

const NO_PROJECTS: ProjectRow[] = [];

/**
 * The left pane: filter, New chat, the projects with their conversations, then the conversations
 * in no project. Rows come from the caches the layout seeded, so the list never loads; renaming,
 * moving and deleting update it before the server answers.
 */
export const ConversationList = ({
  assistantId,
  snapshot,
  projectSnapshot,
}: ConversationListProps) => {
  const params = useParams<{ conversationId?: string; projectId?: string }>();
  const router = useRouter();
  const { onNavigate } = useChatPane();
  const selection = useChatSelection();
  const prefetchThread = usePrefetchThread();
  // The row lights up on click, before the router has the route; outside a shell, the route alone.
  const activeId = selection ? selection.selectedId : (params.conversationId ?? null);
  const activeProjectId = selection
    ? selection.selectedProjectId
    : params.conversationId
      ? null
      : (params.projectId ?? null);
  const { data, isError, error, refetch } = useConversations(assistantId, snapshot);
  const { data: projectData } = useProjects(assistantId, projectSnapshot);
  const projects = projectData ?? NO_PROJECTS;
  const { rename, remove } = useConversationActions(assistantId);
  const projectActions = useProjectActions(assistantId);
  const dialog = useProjectDialog();
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ConversationRow | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<ProjectRow | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatsHeadingId = useId();
  const base = `/a/${assistantId}/chat`;

  const filtering = query.trim().length > 0;
  const { byProject, loose, shownProjects } = useMemo(() => {
    const rows = filterConversations(data ?? [], query);
    const grouped = groupConversations(rows, projects);
    const needle = query.trim().toLowerCase();

    return {
      ...grouped,
      shownProjects: needle
        ? projects.filter(
            (project) =>
              project.name.toLowerCase().includes(needle) || grouped.byProject.has(project.id),
          )
        : projects,
    };
  }, [data, query, projects]);
  const matches = loose.length + shownProjects.length;
  const outOfProject = useConversationDrop((conversationId) =>
    void projectActions.move(conversationId, null),
  );

  const follow =
    (conversationId: string | null) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (isPlainLeftClick(event)) {
        selection?.select(conversationId);
      }

      onNavigate?.();
    };

  const openProject = (projectId: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (isPlainLeftClick(event)) {
      selection?.selectProject(projectId);
    }

    onNavigate?.();
  };

  /** A project's home is where its new chats start; the menu and a new project both go there. */
  const goToProject = (projectId: string) => {
    selection?.selectProject(projectId);
    router.push(`${base}/projects/${projectId}`);
    onNavigate?.();
  };

  const move = (conversationId: string, projectId: string | null) => {
    if (projectId) {
      setFolderOpen(projectId, true);
    }

    void projectActions.move(conversationId, projectId);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k' &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const confirmDelete = () => {
    const target = pendingDelete;

    if (!target) {
      return;
    }

    setPendingDelete(null);

    // The action goes out first; the navigation that follows takes priority over it in the router.
    void remove(target.id);

    if (target.id === activeId) {
      selection?.select(null);
      router.push(base);
    }
  };

  const confirmProjectDelete = () => {
    const target = projectToDelete;

    if (!target) {
      return;
    }

    setProjectToDelete(null);
    void projectActions.remove(target.id);

    // Its home is gone; its chats stay where they are, so an open one stays open.
    if (target.id === activeProjectId && !activeId) {
      selection?.select(null);
      router.push(base);
    }
  };

  const renderConversation = (row: ConversationRow, nested: boolean) => (
    <ConversationRowItem
      row={row}
      href={`${base}/${row.id}`}
      active={row.id === activeId}
      renaming={row.id === renamingId}
      projects={projects}
      nested={nested}
      onNavigate={follow(row.id)}
      onIntent={() => prefetchThread(row.id)}
      onRename={() => setRenamingId(row.id)}
      onRenameSubmit={(title) => {
        setRenamingId(null);
        void rename(row.id, title);
      }}
      onRenameCancel={() => setRenamingId(null)}
      onDelete={() => setPendingDelete(row)}
      onMove={(projectId) => move(row.id, projectId)}
    />
  );

  const releasedCount = projectToDelete
    ? (data ?? []).filter((row) => row.project_id === projectToDelete.id).length
    : 0;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="conversation-list">
      <div className="flex flex-col gap-2 p-2">
        <Button asChild variant="outline" className="justify-start">
          <Link href={base} onClick={follow(null)}>
            <Plus data-icon="inline-start" />
            New chat
          </Link>
        </Button>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
          <Input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setQuery('');
                event.currentTarget.blur();
              }
            }}
            placeholder="Filter conversations"
            aria-label="Filter conversations"
            className="bg-background h-8 pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2 rounded-sm"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="text-muted-foreground pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 font-sans text-[10px] sm:inline">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="Conversations">
        {filtering && matches === 0 && data ? (
          <p className="text-muted-foreground px-2 py-6 text-sm">
            Nothing matches “{query.trim()}”.
          </p>
        ) : (
          <>
            {!filtering || shownProjects.length > 0 ? (
              <ProjectsSection
                base={base}
                projects={shownProjects}
                allProjects={projects}
                byProject={byProject}
                filtering={filtering}
                activeConversationId={activeId}
                activeProjectId={activeProjectId}
                renderConversation={(row) => renderConversation(row, true)}
                onCreate={(name) => goToProject(projectActions.create(name))}
                onOpenProject={openProject}
                onNewChat={goToProject}
                onEdit={dialog.edit}
                onRename={(projectId, name) => void projectActions.rename(projectId, name)}
                onDelete={setProjectToDelete}
                onMoveConversation={move}
              />
            ) : null}

            <section aria-labelledby={chatsHeadingId} className="mt-2 flex flex-col">
              <h2
                id={chatsHeadingId}
                className={cn(
                  'text-muted-foreground rounded-md px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide',
                  outOfProject.over && 'ring-primary bg-primary/10 ring-2 ring-inset',
                )}
                {...outOfProject.handlers}
              >
                Chats
              </h2>
              {isError && !data ? (
                <div
                  className="text-muted-foreground flex flex-col gap-2 px-2 py-6 text-sm"
                  role="alert"
                >
                  <p>
                    The conversations could not be loaded.{' '}
                    {error instanceof Error ? error.message : ''}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() => void refetch()}
                  >
                    Try again
                  </Button>
                </div>
              ) : !data || data.length === 0 ? (
                <p className="text-muted-foreground px-2 py-6 text-sm">
                  No conversations yet. Ask the assistant something and it will appear here.
                </p>
              ) : loose.length === 0 ? (
                filtering ? null : (
                  <p className="text-muted-foreground px-2 py-3 text-sm">
                    Every chat is in a project. New chats outside a project appear here.
                  </p>
                )
              ) : (
                <ul className="flex flex-col gap-0.5" {...outOfProject.handlers}>
                  {loose.map((row) => (
                    <li key={row.id}>{renderConversation(row, false)}</li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </nav>

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => (open ? null : setPendingDelete(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete conversation</DialogTitle>
            <DialogDescription>
              “{pendingDelete ? conversationLabel(pendingDelete) : ''}” and its messages are
              removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(projectToDelete)}
        onOpenChange={(open) => (open ? null : setProjectToDelete(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription>
              “{projectToDelete?.name}” and its instructions are removed.{' '}
              {releasedCount === 0
                ? 'It has no chats.'
                : releasedCount === 1
                  ? 'Its chat is kept and moves to Chats.'
                  : `Its ${releasedCount} chats are kept and move to Chats.`}{' '}
              Its files stay in Knowledge.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProjectToDelete(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmProjectDelete}>
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectDialog
        assistantId={assistantId}
        project={projects.find((project) => project.id === dialog.projectId) ?? null}
        open={dialog.open}
        onClose={dialog.close}
      />
    </div>
  );
};
