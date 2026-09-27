'use client';

import { cn } from 'cn';
import {
  ChevronRight,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  SlidersHorizontal,
  SquarePen,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useId, useState, useSyncExternalStore } from 'react';

import { CONVERSATION_DRAG_TYPE, InlineNameInput } from '@/components/chat/conversation-row';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ConversationRow } from '@/lib/chat/conversations';
import { MAX_PROJECT_NAME, projectNameProblem, type ProjectRow } from '@/lib/chat/projects';

/**
 * Which folders the reader opened or closed, shared by the two panes the list renders in (the
 * sidebar and the phone's sheet) and remembered in this browser. A folder nobody touched is open
 * while it holds what is on screen.
 */
const FOLDERS_KEY = 'parbot:chat:folders';
const NO_CHOICES: Record<string, boolean> = {};
let choices: Record<string, boolean> | null = null;
const folderListeners = new Set<() => void>();

const readChoices = () => {
  if (choices === null) {
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(FOLDERS_KEY) ?? '{}');

      choices =
        stored && typeof stored === 'object' && !Array.isArray(stored)
          ? (stored as Record<string, boolean>)
          : {};
    } catch {
      choices = {};
    }
  }

  return choices;
};

/** Opens or closes a folder for this reader. */
export const setFolderOpen = (projectId: string, open: boolean) => {
  choices = { ...readChoices(), [projectId]: open };

  try {
    window.localStorage.setItem(FOLDERS_KEY, JSON.stringify(choices));
  } catch {
    // Private windows and blocked storage still toggle for this visit.
  }

  for (const listener of folderListeners) {
    listener();
  }
};

const subscribeFolders = (listener: () => void) => {
  folderListeners.add(listener);

  return () => {
    folderListeners.delete(listener);
  };
};

/** Test hook. */
export const resetFolderChoices = () => {
  choices = null;
};

const useFolderChoices = () =>
  useSyncExternalStore(subscribeFolders, readChoices, () => NO_CHOICES);

/** Lights a drop target while one of our conversation rows is dragged over it. */
export const useConversationDrop = (onDrop: (conversationId: string) => void) => {
  const [over, setOver] = useState(false);
  const carries = (event: React.DragEvent) =>
    event.dataTransfer.types.includes(CONVERSATION_DRAG_TYPE);

  return {
    over,
    handlers: {
      onDragOver: (event: React.DragEvent) => {
        if (carries(event)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setOver(true);
        }
      },
      onDragLeave: () => setOver(false),
      onDrop: (event: React.DragEvent) => {
        const id = event.dataTransfer.getData(CONVERSATION_DRAG_TYPE);

        setOver(false);

        if (id) {
          event.preventDefault();
          onDrop(id);
        }
      },
    },
  };
};

type FolderProps = {
  project: ProjectRow;
  href: string;
  conversations: ConversationRow[];
  open: boolean;
  active: boolean;
  renaming: boolean;
  projects: ProjectRow[];
  renderConversation: (row: ConversationRow) => React.ReactNode;
  onToggle: () => void;
  onOpenProject: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onNewChat: () => void;
  onEdit: () => void;
  onRename: () => void;
  onRenameSubmit: (name: string) => void;
  onRenameCancel: () => void;
  onDelete: () => void;
  onDropConversation: (conversationId: string) => void;
};

const ProjectFolder = ({
  project,
  href,
  conversations,
  open,
  active,
  renaming,
  projects,
  renderConversation,
  onToggle,
  onOpenProject,
  onNewChat,
  onEdit,
  onRename,
  onRenameSubmit,
  onRenameCancel,
  onDelete,
  onDropConversation,
}: FolderProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const drop = useConversationDrop(onDropConversation);
  const Icon = open ? FolderOpen : FolderClosed;
  const count = conversations.length;

  return (
    <li data-testid="project-folder" data-project={project.id} data-open={open || undefined}>
      {renaming ? (
        <InlineNameInput
          initial={project.name}
          label="Project name"
          maxLength={MAX_PROJECT_NAME}
          validate={(name) => projectNameProblem(name, projects, project.id)}
          onSubmit={onRenameSubmit}
          onCancel={onRenameCancel}
        />
      ) : (
        <div
          className={cn(
            'group flex h-10 items-center rounded-md transition-colors',
            active
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'hover:bg-sidebar-accent/60',
            menuOpen && !active && 'bg-sidebar-accent/60',
            drop.over && 'ring-primary bg-primary/10 ring-2 ring-inset',
          )}
          data-active={active || undefined}
          {...drop.handlers}
        >
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? 'Close' : 'Open'} the folder ${project.name}`}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 ml-1 flex size-7 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2"
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform', open && 'rotate-90')}
              aria-hidden="true"
            />
          </button>
          <Link
            href={href}
            prefetch={false}
            onClick={onOpenProject}
            aria-current={active ? 'page' : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 self-stretch pr-1 text-sm outline-none focus-visible:underline"
          >
            <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
            <span className={cn('truncate', active ? 'font-medium' : 'text-foreground/90')}>
              {project.name}
            </span>
            {count > 0 ? (
              <span
                className="text-muted-foreground ml-auto shrink-0 text-[11px] tabular-nums"
                aria-label={`${count} ${count === 1 ? 'chat' : 'chats'}`}
              >
                {count}
              </span>
            ) : null}
          </Link>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Actions for the project ${project.name}`}
                className="pointer-coarse:opacity-100 mr-1 shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={onNewChat}>
                <SquarePen />
                New chat in this project
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onEdit}>
                <SlidersHorizontal />
                Edit project
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onRename}>
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {open ? (
        count > 0 ? (
          <ul className="flex flex-col gap-0.5 pt-0.5" aria-label={`Chats in ${project.name}`}>
            {conversations.map((row) => (
              <li key={row.id}>{renderConversation(row)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground py-1.5 pl-10 pr-2 text-xs">
            No chats yet. Start one here, or move a chat into this project.
          </p>
        )
      ) : null}
    </li>
  );
};

export type ProjectsSectionProps = {
  base: string;
  projects: ProjectRow[];
  /** Every project, for the name check; `projects` may be filtered. */
  allProjects: ProjectRow[];
  byProject: Map<string, ConversationRow[]>;
  /** While the list is filtered, every folder that shows is open. */
  filtering: boolean;
  activeConversationId: string | null;
  activeProjectId: string | null;
  renderConversation: (row: ConversationRow) => React.ReactNode;
  onCreate: (name: string) => void;
  onOpenProject: (projectId: string) => (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onNewChat: (projectId: string) => void;
  onEdit: (projectId: string) => void;
  onRename: (projectId: string, name: string) => void;
  onDelete: (project: ProjectRow) => void;
  onMoveConversation: (conversationId: string, projectId: string) => void;
};

/**
 * The Projects part of the chat sidebar: New project, then one folder per project with its
 * conversations, newest first. A folder opens the project's home from its name and shows its
 * chats from the arrow; a conversation dragged onto a folder moves into it.
 */
export const ProjectsSection = ({
  base,
  projects,
  allProjects,
  byProject,
  filtering,
  activeConversationId,
  activeProjectId,
  renderConversation,
  onCreate,
  onOpenProject,
  onNewChat,
  onEdit,
  onRename,
  onDelete,
  onMoveConversation,
}: ProjectsSectionProps) => {
  const folderChoices = useFolderChoices();
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // The list renders twice (the sidebar and the phone's sheet), so the id is per instance.
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-0.5">
      <h2
        id={headingId}
        className="text-muted-foreground px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide"
      >
        Projects
      </h2>
      {creating ? (
        <InlineNameInput
          initial=""
          label="New project name"
          placeholder="Project name"
          maxLength={MAX_PROJECT_NAME}
          validate={(name) => projectNameProblem(name, allProjects)}
          onSubmit={(name) => {
            setCreating(false);
            onCreate(name);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="text-foreground/90 hover:bg-sidebar-accent/60 focus-visible:ring-ring/50 flex h-10 items-center gap-2 rounded-md pl-2.5 pr-2 text-sm outline-none focus-visible:ring-2"
        >
          <FolderPlus className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          New project
        </button>
      )}
      {projects.length > 0 ? (
        <ul className="flex flex-col gap-0.5" aria-label="Projects">
          {projects.map((project) => {
            const conversations = byProject.get(project.id) ?? [];
            const holdsActive =
              project.id === activeProjectId ||
              conversations.some((row) => row.id === activeConversationId);
            const open = filtering || (folderChoices[project.id] ?? holdsActive);

            return (
              <ProjectFolder
                key={project.id}
                project={project}
                href={`${base}/projects/${project.id}`}
                conversations={conversations}
                open={open}
                active={project.id === activeProjectId && !activeConversationId}
                renaming={project.id === renamingId}
                projects={allProjects}
                renderConversation={renderConversation}
                onToggle={() => setFolderOpen(project.id, !open)}
                onOpenProject={onOpenProject(project.id)}
                onNewChat={() => onNewChat(project.id)}
                onEdit={() => onEdit(project.id)}
                onRename={() => setRenamingId(project.id)}
                onRenameSubmit={(name) => {
                  setRenamingId(null);
                  onRename(project.id, name);
                }}
                onRenameCancel={() => setRenamingId(null)}
                onDelete={() => onDelete(project)}
                onDropConversation={(conversationId) => {
                  setFolderOpen(project.id, true);
                  onMoveConversation(conversationId, project.id);
                }}
              />
            );
          })}
        </ul>
      ) : null}
    </section>
  );
};
