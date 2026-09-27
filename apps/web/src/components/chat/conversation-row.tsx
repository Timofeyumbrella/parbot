'use client';

import { cn } from 'cn';
import {
  Check,
  FolderInput,
  FolderMinus,
  FolderClosed,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  conversationLabel,
  type ConversationRow,
  MAX_TITLE_LENGTH,
} from '@/lib/chat/conversations';
import type { ProjectRow } from '@/lib/chat/projects';
import { relativeTime } from '@/lib/format';

/** What a dragged conversation carries, so only our rows light up a folder they pass over. */
export const CONVERSATION_DRAG_TYPE = 'application/x-parbot-conversation';

export type InlineNameInputProps = {
  initial: string;
  label: string;
  maxLength: number;
  placeholder?: string;
  /** Returns a problem to show instead of saving, or null to save. */
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  className?: string;
};

/**
 * A name typed in place: Enter or leaving the field saves, Esc cancels. Used to rename a
 * conversation or a project and to name a new project.
 */
export const InlineNameInput = ({
  initial,
  label,
  maxLength,
  placeholder,
  validate,
  onSubmit,
  onCancel,
  className,
}: InlineNameInputProps) => {
  const [value, setValue] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const settled = useRef(false);

  const finish = (save: boolean, fromBlur = false) => {
    if (settled.current) {
      return;
    }

    const next = value.trim();

    if (save && next && next !== initial) {
      const issue = validate?.(next) ?? null;

      if (issue) {
        // Leaving the field with a name that cannot be used drops it; Enter keeps it to fix.
        if (fromBlur) {
          settled.current = true;
          onCancel();
        } else {
          setProblem(issue);
        }

        return;
      }

      settled.current = true;
      onSubmit(next);
    } else {
      settled.current = true;
      onCancel();
    }
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <input
        autoFocus
        aria-label={label}
        aria-invalid={problem ? true : undefined}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => {
          setValue(event.target.value);
          setProblem(null);
        }}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => finish(true, true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            finish(true);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            finish(false);
          }
        }}
        className="bg-background focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 aria-invalid:border-destructive h-10 w-full rounded-md border px-2.5 text-sm outline-none"
      />
      {problem ? (
        <p role="alert" className="text-destructive px-1 text-xs">
          {problem}
        </p>
      ) : null}
    </div>
  );
};

/** Relative times depend on the clock, so the server's text is replaced after hydration. */
const RowTime = ({ at }: { at: string | null }) => (
  <span
    className="text-muted-foreground ml-auto shrink-0 text-[11px] tabular-nums"
    suppressHydrationWarning
  >
    {at ? relativeTime(at) : ''}
  </span>
);

export type ConversationRowItemProps = {
  row: ConversationRow;
  href: string;
  active: boolean;
  renaming: boolean;
  /** The projects the row's menu offers to move it into. */
  projects: ProjectRow[];
  /** Rows inside a project folder sit one step in. */
  nested?: boolean;
  onNavigate: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onIntent: () => void;
  onRename: () => void;
  onRenameSubmit: (title: string) => void;
  onRenameCancel: () => void;
  onDelete: () => void;
  onMove: (projectId: string | null) => void;
};

/**
 * One conversation in the sidebar: its link, and a menu to rename it, move it into or out of a
 * project, or delete it. The row can also be dragged onto a project folder.
 */
export const ConversationRowItem = ({
  row,
  href,
  active,
  renaming,
  projects,
  nested = false,
  onNavigate,
  onIntent,
  onRename,
  onRenameSubmit,
  onRenameCancel,
  onDelete,
  onMove,
}: ConversationRowItemProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const label = conversationLabel(row);
  const projectId = row.project_id ?? null;

  if (renaming) {
    return (
      <InlineNameInput
        initial={label}
        label="Conversation title"
        maxLength={MAX_TITLE_LENGTH}
        onSubmit={onRenameSubmit}
        onCancel={onRenameCancel}
        className={nested ? 'pl-6' : undefined}
      />
    );
  }

  return (
    <div
      className={cn(
        'group flex h-10 items-center rounded-md transition-colors',
        nested && 'ml-4',
        active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/60',
        menuOpen && !active && 'bg-sidebar-accent/60',
      )}
      data-active={active || undefined}
      data-testid="conversation-row"
    >
      <Link
        href={href}
        // The pane selects on the client, so the route prefetch would buy nothing here; left on, a
        // long list queues ahead of the sidebar's own prefetches after a page load.
        prefetch={false}
        onClick={onNavigate}
        onPointerEnter={onIntent}
        onFocus={onIntent}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(CONVERSATION_DRAG_TYPE, row.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
        aria-current={active ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 self-stretch pl-2.5 pr-1 text-sm outline-none focus-visible:underline"
      >
        {row.unanswered_count > 0 ? (
          <span
            className="bg-warning size-1.5 shrink-0 rounded-full"
            title={`${row.unanswered_count} unanswered`}
            aria-label={`${row.unanswered_count} unanswered`}
          />
        ) : null}
        <span className={cn('truncate', active ? 'font-medium' : 'text-foreground/90')}>
          {label}
        </span>
        <RowTime at={row.last_message_at} />
      </Link>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${label}`}
            className="pointer-coarse:opacity-100 mr-1 shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={onRename}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput />
              Move to project
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 w-52 overflow-y-auto">
              {projects.length === 0 ? (
                <DropdownMenuItem disabled className="whitespace-normal">
                  No projects yet. Create one with New project.
                </DropdownMenuItem>
              ) : (
                projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    disabled={project.id === projectId}
                    onSelect={() => onMove(project.id)}
                  >
                    <FolderClosed />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {project.id === projectId ? (
                      <Check className="text-primary" aria-label="Current project" />
                    ) : null}
                  </DropdownMenuItem>
                ))
              )}
              {projectId ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onMove(null)}>
                    <FolderMinus />
                    Remove from project
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
