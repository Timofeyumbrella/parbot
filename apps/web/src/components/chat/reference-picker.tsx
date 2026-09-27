'use client';

import { cn } from 'cn';
import { Check } from 'lucide-react';

import { SOURCE_KINDS } from '@/components/knowledge/format';
import { Skeleton } from '@/components/ui/skeleton';
import type { ReferenceOption } from '@/lib/chat/references';

export type ReferencePickerProps = {
  /** The listbox's id, which the message box names in aria-controls. */
  id: string;
  /** Undefined while the list is loading. */
  options: ReferenceOption[] | undefined;
  failed?: boolean;
  /** Whether the assistant has any sources at all, to tell "nothing yet" from "no match". */
  hasSources: boolean;
  query: string;
  activeIndex: number;
  selectedIds: ReadonlySet<string>;
  optionId: (index: number) => string;
  onPick: (option: ReferenceOption) => void;
  onActivate: (index: number) => void;
};

const STATUS_NOTE: Partial<Record<ReferenceOption['status'], string>> = {
  queued: 'Indexing',
  crawling: 'Indexing',
  indexing: 'Indexing',
  failed: 'Failed',
};

/**
 * The list an @ in the message box opens: the assistant's files and sources, filtered by what
 * follows the @. Focus stays in the message box (arrows move, Enter or Tab picks, Esc closes), so
 * a mouse press here must not take it away.
 */
export const ReferencePicker = ({
  id,
  options,
  failed = false,
  hasSources,
  query,
  activeIndex,
  selectedIds,
  optionId,
  onPick,
  onActivate,
}: ReferencePickerProps) => (
  <div
    className="bg-popover text-popover-foreground absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-xl border shadow-lg"
    data-testid="reference-picker"
    onMouseDown={(event) => event.preventDefault()}
  >
    <div className="text-muted-foreground flex items-center justify-between gap-2 border-b px-3 py-1.5 text-[11px]">
      <span>Point the question at a file or source</span>
      <span className="hidden sm:inline">Arrows to move, Enter to pick, Esc to close</span>
    </div>
    {failed ? (
      <p className="text-destructive px-3 py-3 text-sm">
        The sources could not be loaded. Close this and type @ again to retry.
      </p>
    ) : !options ? (
      <div className="flex flex-col gap-2 p-3" aria-label="Loading sources" aria-busy="true">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    ) : options.length === 0 ? (
      <p className="text-muted-foreground px-3 py-3 text-sm" role="status">
        {hasSources
          ? `Nothing matches “${query}”. Check the name in Knowledge, or attach the file with the paperclip.`
          : 'No files or sources yet. Attach a file with the paperclip, or add sources in Knowledge.'}
      </p>
    ) : (
      <ul
        role="listbox"
        id={id}
        aria-label="Files and sources"
        className="max-h-64 overflow-y-auto overscroll-contain p-1"
      >
        {options.map((option, index) => {
          const Icon = SOURCE_KINDS[option.kind].icon;
          const active = index === activeIndex;
          const note = STATUS_NOTE[option.status];

          return (
            <li
              key={option.id}
              id={optionId(index)}
              role="option"
              aria-selected={active}
              onClick={() => onPick(option)}
              onMouseMove={() => {
                if (!active) {
                  onActivate(index);
                }
              }}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5',
                active && 'bg-accent text-accent-foreground',
              )}
            >
              <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{option.title}</span>
                <span className="text-muted-foreground truncate text-xs">{option.detail}</span>
              </div>
              {note ? (
                <span
                  className={cn(
                    'shrink-0 text-[11px]',
                    option.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {note}
                </span>
              ) : null}
              {selectedIds.has(option.id) ? (
                <Check className="text-primary size-4 shrink-0" aria-label="Already added" />
              ) : null}
            </li>
          );
        })}
      </ul>
    )}
  </div>
);
