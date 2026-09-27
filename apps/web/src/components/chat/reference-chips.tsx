'use client';

import { cn } from 'cn';
import { Check, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';

import { SOURCE_KINDS } from '@/components/knowledge/format';
import {
  type ChipStatus,
  chipLabel,
  type DraftReference,
  type MessageReference,
} from '@/lib/chat/references';
import { sourceHref } from '@/lib/knowledge/links';

const StatusMark = ({ status, known = false }: { status: ChipStatus; known?: boolean }) => {
  const label = chipLabel(status, known);

  if (!label) {
    return null;
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 text-[11px]',
        status === 'failed' || status === 'missing'
          ? 'text-destructive'
          : status === 'ready'
            ? 'text-muted-foreground'
            : 'text-muted-foreground',
      )}
    >
      {status === 'uploading' || status === 'indexing' ? (
        <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
      ) : status === 'ready' ? (
        <Check className="text-success size-3" aria-hidden="true" />
      ) : (
        <TriangleAlert className="size-3" aria-hidden="true" />
      )}
      {label}
    </span>
  );
};

/** A reference in the composer (`known` included) and where its file is. */
export type ComposerChip = DraftReference & {
  status: ChipStatus;
  error?: string;
};

/** What hovering a chip explains: why it failed, or that it is the copy already in Knowledge. */
const chipTitle = (chip: ComposerChip) =>
  chip.error ??
  (chip.known && chip.status !== 'failed' && chip.status !== 'missing'
    ? `${chip.title} is already in Knowledge, so the question reads that file. It was not uploaded again.`
    : null);

/**
 * A reference waiting in the composer: what it is, whether it can be read yet, and a way to take it
 * off the next question. The status says Uploading, Indexing, Ready or Failed as the file moves
 * through Knowledge, or that an attached file is the one already in Knowledge.
 */
export const ComposerReferenceChip = ({
  chip,
  onRemove,
}: {
  chip: ComposerChip;
  onRemove: (id: string) => void;
}) => {
  const Icon = SOURCE_KINDS[chip.kind].icon;

  return (
    <span
      className={cn(
        'bg-muted/60 inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border pl-2 pr-0.5 text-xs',
        (chip.status === 'failed' || chip.status === 'missing') && 'border-destructive/40',
      )}
      data-testid="reference-chip"
      data-status={chip.status}
      data-known={chip.known || undefined}
      title={chipTitle(chip) ?? chip.title}
    >
      <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 max-w-40 truncate font-medium sm:max-w-56">{chip.title}</span>
      <StatusMark status={chip.status} known={chip.known} />
      <button
        type="button"
        onClick={() => onRemove(chip.id)}
        aria-label={`Remove ${chip.title}`}
        className="text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-ring/50 flex size-6 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-2"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
};

/**
 * A project's file in the composer: read by every question in the project, so it has no remove
 * button here; the project is where it changes.
 */
export const ProjectFileChip = ({ chip, project }: { chip: ComposerChip; project: string }) => {
  const Icon = SOURCE_KINDS[chip.kind].icon;

  return (
    <span
      className={cn(
        'border-primary/25 bg-primary/5 inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs',
        (chip.status === 'failed' || chip.status === 'missing') && 'border-destructive/40',
      )}
      data-testid="project-chip"
      data-status={chip.status}
      title={chip.error ?? `${chip.title}, from the project ${project}. Change it in the project.`}
    >
      <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 max-w-40 truncate font-medium sm:max-w-56">{chip.title}</span>
      <span className="sr-only">, from the project {project}</span>
      <StatusMark status={chip.status} />
    </span>
  );
};

/** The files a question was asked with, on its bubble; each opens its text in the viewer. */
export const MessageReferences = ({
  references,
  assistantId,
  className,
}: {
  references: MessageReference[];
  assistantId: string;
  className?: string;
}) => (
  <ul
    className={cn('flex max-w-[85%] flex-wrap justify-end gap-1', className)}
    aria-label="Referenced files"
  >
    {references.map((reference) => {
      const Icon = SOURCE_KINDS[reference.kind].icon;

      return (
        <li key={reference.id} className="min-w-0 max-w-full">
          <Link
            href={sourceHref(assistantId, reference.id)}
            className="bg-card hover:bg-muted text-muted-foreground hover:text-foreground inline-flex h-6 max-w-full items-center gap-1 rounded-md border px-1.5 text-[11px] transition-colors"
            data-testid="message-reference"
          >
            <Icon className="size-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{reference.title}</span>
          </Link>
        </li>
      );
    })}
  </ul>
);
