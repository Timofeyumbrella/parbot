'use client';

import { cn } from 'cn';
import { MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useChatPane } from '@/components/chat/chat-shell';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useConversationActions, useConversations } from '@/hooks/use-conversations';
import {
  conversationLabel,
  type ConversationRow,
  type ConversationSnapshot,
  filterConversations,
  MAX_TITLE_LENGTH,
} from '@/lib/chat/conversations';
import { relativeTime } from '@/lib/format';

export type ConversationListProps = {
  assistantId: string;
  /** The first page, read by the server; seeds the cache. */
  snapshot?: ConversationSnapshot;
};

type RenameInputProps = {
  initial: string;
  onSubmit: (title: string) => void;
  onCancel: () => void;
};

const RenameInput = ({ initial, onSubmit, onCancel }: RenameInputProps) => {
  const [value, setValue] = useState(initial);
  const settled = useRef(false);

  const finish = (save: boolean) => {
    if (settled.current) {
      return;
    }

    settled.current = true;

    const next = value.trim();

    if (save && next && next !== initial) {
      onSubmit(next);
    } else {
      onCancel();
    }
  };

  return (
    <input
      autoFocus
      aria-label="Conversation title"
      value={value}
      maxLength={MAX_TITLE_LENGTH}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        }
      }}
      className="bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:ring-3"
    />
  );
};

/** Relative times depend on the clock, so the server's text is replaced after hydration. */
const RowTime = ({ at }: { at: string | null }) => (
  <span className="text-muted-foreground ml-auto shrink-0 text-[11px] tabular-nums" suppressHydrationWarning>
    {at ? relativeTime(at) : ''}
  </span>
);

type RowProps = {
  row: ConversationRow;
  href: string;
  active: boolean;
  renaming: boolean;
  onNavigate?: () => void;
  onRename: () => void;
  onRenameSubmit: (title: string) => void;
  onRenameCancel: () => void;
  onDelete: () => void;
};

const Row = ({ row, href, active, renaming, onNavigate, onRename, onRenameSubmit, onRenameCancel, onDelete }: RowProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const label = conversationLabel(row);

  if (renaming) {
    return <RenameInput initial={label} onSubmit={onRenameSubmit} onCancel={onRenameCancel} />;
  }

  return (
    <div
      className={cn(
        'group flex h-10 items-center rounded-md transition-colors',
        active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/60',
        menuOpen && !active && 'bg-sidebar-accent/60',
      )}
      data-active={active || undefined}
    >
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 self-stretch pr-1 pl-2.5 text-sm outline-none focus-visible:underline"
      >
        {row.unanswered_count > 0 ? (
          <span
            className="bg-warning size-1.5 shrink-0 rounded-full"
            title={`${row.unanswered_count} unanswered`}
            aria-label={`${row.unanswered_count} unanswered`}
          />
        ) : null}
        <span className={cn('truncate', active ? 'font-medium' : 'text-foreground/90')}>{label}</span>
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
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={onRename}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

/**
 * The left pane: filter, New chat, and one row per conversation. Rows come from the cache the
 * layout seeded, so the list never loads; rename and delete update it before the server answers.
 */
export const ConversationList = ({ assistantId, snapshot }: ConversationListProps) => {
  const params = useParams<{ conversationId?: string }>();
  const router = useRouter();
  const { onNavigate } = useChatPane();
  const activeId = params.conversationId ?? null;
  const { data, isError, error, refetch } = useConversations(assistantId, snapshot);
  const { rename, remove } = useConversationActions(assistantId);
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ConversationRow | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rows = useMemo(() => filterConversations(data ?? [], query), [data, query]);
  const base = `/a/${assistantId}/chat`;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.altKey && !event.shiftKey) {
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
      router.push(base);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="conversation-list">
      <div className="flex flex-col gap-2 p-2">
        <Button asChild variant="outline" className="justify-start">
          <Link href={base} onClick={onNavigate}>
            <Plus data-icon="inline-start" />
            New chat
          </Link>
        </Button>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
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
            className="bg-background h-8 pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-sm"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 font-sans text-[10px] sm:inline">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="Conversations">
        {isError && !data ? (
          <div className="text-muted-foreground flex flex-col gap-2 px-2 py-6 text-sm" role="alert">
            <p>The conversations could not be loaded. {error instanceof Error ? error.message : ''}</p>
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-sm">
            No conversations yet. Ask the assistant something and it will appear here.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-sm">Nothing matches “{query.trim()}”.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {rows.map((row) => (
              <li key={row.id}>
                <Row
                  row={row}
                  href={`${base}/${row.id}`}
                  active={row.id === activeId}
                  renaming={row.id === renamingId}
                  onNavigate={onNavigate}
                  onRename={() => setRenamingId(row.id)}
                  onRenameSubmit={(title) => {
                    setRenamingId(null);
                    void rename(row.id, title);
                  }}
                  onRenameCancel={() => setRenamingId(null)}
                  onDelete={() => setPendingDelete(row)}
                />
              </li>
            ))}
          </ul>
        )}
      </nav>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => (open ? null : setPendingDelete(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete conversation</DialogTitle>
            <DialogDescription>
              “{pendingDelete ? conversationLabel(pendingDelete) : ''}” and its messages are removed. This cannot be
              undone.
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
    </div>
  );
};
