'use client';

import { Ellipsis, FileText, RefreshCw, Trash, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Source } from '@/lib/db';
import { relativeTime } from '@/lib/format';

import { describeSource, isActiveStatus, plural, SOURCE_KINDS } from './format';
import { SourcePagesSheet } from './source-pages-sheet';
import { StatusBadge } from './status-badge';

/** What goes with the source: its pages and passages, and the stored file when there is one. */
export const deleteWarning = (source: Pick<Source, 'document_count' | 'storage_path'>) => {
  const pages =
    source.document_count > 0
      ? `The ${plural(source.document_count, 'page')} it added, and their passages, are removed from the assistant's knowledge.`
      : 'Nothing has been indexed from it yet.';
  const file = source.storage_path ? ' The stored file is deleted too.' : '';

  return `${pages}${file} This cannot be undone.`;
};

type SourceRowProps = {
  source: Source;
  onReindex: (source: Source) => void;
  onDelete: (source: Source) => void;
};

export const SourceRow = ({ source, onReindex, onDelete }: SourceRowProps) => {
  const [pagesOpen, setPagesOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const kind = SOURCE_KINDS[source.kind];
  const active = isActiveStatus(source.status);
  const indexed = source.last_indexed_at ? relativeTime(source.last_indexed_at) : null;

  return (
    <li className="flex items-start gap-3 px-4 py-3" data-testid="source-row">
      <span
        className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md"
        aria-label={kind.label}
        title={kind.label}
      >
        <kind.icon className="size-4" aria-hidden="true" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">{source.title}</span>
          <StatusBadge source={source} />
        </div>
        <p className="text-muted-foreground truncate text-xs" title={describeSource(source)}>
          {describeSource(source)}
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {plural(source.document_count, 'page')} · {plural(source.chunk_count, 'passage')} ·{' '}
          {/* The relative time is computed on both sides of hydration and may cross a minute. */}
          <span suppressHydrationWarning>{indexed ? `indexed ${indexed}` : 'not indexed yet'}</span>
        </p>
        {source.status === 'ready' && source.error ? (
          // A run that finished with pages left out says so here, in the row itself.
          <p className="text-warning flex items-start gap-1.5 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="break-words">{source.error}</span>
          </p>
        ) : null}
        {source.status === 'failed' && source.error ? (
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
              className="text-destructive text-xs underline-offset-4 hover:underline"
            >
              {detailsOpen ? 'Hide details' : 'Show what happened'}
            </button>
            {detailsOpen ? (
              <p className="text-destructive break-words text-xs">{source.error}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${source.title}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => onReindex(source)} disabled={active}>
            <RefreshCw />
            Re-index
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPagesOpen(true)}>
            <FileText />
            View pages
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SourcePagesSheet source={source} open={pagesOpen} onOpenChange={setPagesOpen} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {source.title}?</DialogTitle>
            <DialogDescription>{deleteWarning(source)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onDelete(source);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
};
