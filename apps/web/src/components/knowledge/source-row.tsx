'use client';

import { Ellipsis, FileText, RefreshCw, Trash } from 'lucide-react';
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

import { describeSource, isActiveStatus, plural, relativeTime, SOURCE_KINDS } from './format';
import { SourcePagesSheet } from './source-pages-sheet';
import { StatusBadge } from './status-badge';

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
  const indexed = relativeTime(source.last_indexed_at);

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
          {indexed ? `indexed ${indexed}` : 'not indexed yet'}
        </p>
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
            {detailsOpen ? <p className="text-destructive text-xs break-words">{source.error}</p> : null}
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
            <DialogDescription>
              Its {plural(source.document_count, 'page')} leave this assistant&apos;s knowledge and the stored
              file, if any, is removed. This cannot be undone.
            </DialogDescription>
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
