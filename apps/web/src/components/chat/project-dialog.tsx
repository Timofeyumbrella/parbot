'use client';

import { cn } from 'cn';
import { Check, Paperclip, Search } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';

import { FormField } from '@/components/auth/form-field';
import { ComposerReferenceChip } from '@/components/chat/reference-chips';
import { SOURCE_KINDS } from '@/components/knowledge/format';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { type ProjectPatch, useProjectActions, useProjectList } from '@/hooks/use-projects';
import { useAttachFiles, useReferenceChips } from '@/hooks/use-reference-sources';
import {
  MAX_PROJECT_INSTRUCTIONS,
  MAX_PROJECT_NAME,
  MAX_PROJECT_SOURCES,
  projectNameProblem,
  type ProjectRow,
} from '@/lib/chat/projects';
import {
  addReference,
  filterReferenceOptions,
  type MessageReference,
  removeReference,
  sameReferences,
  toReference,
} from '@/lib/chat/references';
import { formatCount } from '@/lib/format';
import { UPLOAD_ACCEPT } from '@/lib/uploads';

export type ProjectDialogProps = {
  assistantId: string;
  /** The project to edit. */
  project: ProjectRow | null;
  open: boolean;
  onClose: () => void;
};

const STATUS_NOTE: Partial<Record<string, string>> = {
  queued: 'Indexing',
  crawling: 'Indexing',
  indexing: 'Indexing',
  failed: 'Failed',
};

const LIMIT_MESSAGE = `A project holds up to ${MAX_PROJECT_SOURCES} files.`;

type FormProps = { assistantId: string; project: ProjectRow; onClose: () => void };

const ProjectForm = ({ assistantId, project, onClose }: FormProps) => {
  const projects = useProjectList(assistantId);
  const { update } = useProjectActions(assistantId);
  const [name, setName] = useState(project.name);
  const [instructions, setInstructions] = useState(project.instructions);
  const [files, setFiles] = useState<MessageReference[]>(project.sources);
  const [filter, setFilter] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const { chips, sources } = useReferenceChips(assistantId, files);
  const attachFiles = useAttachFiles(assistantId);
  const selected = useMemo(() => new Set(files.map((file) => file.id)), [files]);
  const options = useMemo(
    () => (sources.data ? filterReferenceOptions(sources.data, filter) : undefined),
    [sources.data, filter],
  );
  const full = files.length >= MAX_PROJECT_SOURCES;

  const toggle = (option: MessageReference) =>
    setFiles((current) =>
      current.some((file) => file.id === option.id)
        ? removeReference(current, option.id)
        : addReference(current, option, MAX_PROJECT_SOURCES),
    );

  const save = (event: React.FormEvent) => {
    event.preventDefault();

    const problem = projectNameProblem(name, projects ?? [], project.id);

    if (problem) {
      setNameError(problem);

      return;
    }

    const patch: ProjectPatch = {};

    if (name.trim() !== project.name) {
      patch.name = name.trim();
    }

    if (instructions.trim() !== project.instructions) {
      patch.instructions = instructions.trim();
    }

    if (!sameReferences(files, project.sources)) {
      patch.sources = files.map(toReference);
    }

    // The dialog closes at once; the sidebar and the chats show the change straight away.
    onClose();

    if (Object.keys(patch).length > 0) {
      void update(project.id, patch);
    }
  };

  return (
    <form onSubmit={save} className="flex min-h-0 flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Edit project</DialogTitle>
        <DialogDescription>
          Every chat in this project reads its files and follows its instructions.
        </DialogDescription>
      </DialogHeader>

      <div className="-mx-4 flex min-h-0 flex-col gap-4 overflow-y-auto px-4">
        <FormField label="Name" error={nameError}>
          {(control) => (
            <Input
              {...control}
              name="name"
              value={name}
              maxLength={MAX_PROJECT_NAME}
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
                setNameError(undefined);
              }}
            />
          )}
        </FormField>

        <FormField
          label="Instructions"
          hint={`${formatCount(instructions.length)} of ${formatCount(MAX_PROJECT_INSTRUCTIONS)} characters. They come after the assistant's own instructions and cannot make it answer from outside your docs.`}
        >
          {(control) => (
            <Textarea
              {...control}
              name="instructions"
              value={instructions}
              maxLength={MAX_PROJECT_INSTRUCTIONS}
              rows={4}
              placeholder="For example: answer for the billing team, and lead with the plan name."
              onChange={(event) => setInstructions(event.target.value)}
              className="max-h-48 min-h-24"
            />
          )}
        </FormField>

        <section className="flex flex-col gap-2" aria-labelledby={`${listId}-files`}>
          <div className="flex items-center justify-between gap-2">
            <h3 id={`${listId}-files`} className="text-sm font-medium">
              Files
            </h3>
            <span className="text-muted-foreground text-xs tabular-nums">
              {files.length} of {MAX_PROJECT_SOURCES}
            </span>
          </div>
          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" aria-label="The project's files">
              {chips.map((chip) => (
                <ComposerReferenceChip
                  key={chip.id}
                  chip={chip}
                  onRemove={(id) => setFiles((current) => removeReference(current, id))}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              No files yet. Pick some from Knowledge below, or attach new ones.
            </p>
          )}

          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Find a file or source"
                aria-label="Find a file or source in Knowledge"
                aria-controls={listId}
                className="h-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={full}
              title={full ? LIMIT_MESSAGE : undefined}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip data-icon="inline-start" />
              Attach
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={UPLOAD_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose files to add to the project"
              onChange={(event) => {
                const picked = [...(event.target.files ?? [])];

                event.target.value = '';
                setFiles((current) =>
                  attachFiles(picked, current, {
                    limit: MAX_PROJECT_SOURCES,
                    limitMessage: LIMIT_MESSAGE,
                  }),
                );
              }}
            />
          </div>

          <div className="max-h-48 overflow-y-auto overscroll-contain rounded-lg border">
            {sources.isError && !sources.data ? (
              <p className="text-destructive px-3 py-3 text-sm" role="alert">
                The files in Knowledge could not be loaded. Close this and open it again to retry.
              </p>
            ) : !options ? (
              <div className="flex flex-col gap-2 p-3" aria-busy="true" aria-label="Loading files">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : options.length === 0 ? (
              <p className="text-muted-foreground px-3 py-3 text-sm" role="status">
                {(sources.data?.length ?? 0) > 0
                  ? `Nothing matches “${filter.trim()}”. Check the name in Knowledge, or attach the file.`
                  : 'No files or sources yet. Attach a file, or add sources in Knowledge.'}
              </p>
            ) : (
              <ul id={listId} className="flex flex-col p-1" aria-label="Files and sources">
                {options.map((option) => {
                  const Icon = SOURCE_KINDS[option.kind].icon;
                  const added = selected.has(option.id);
                  const note = STATUS_NOTE[option.status];

                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        aria-pressed={added}
                        disabled={!added && full}
                        onClick={() => toggle(option)}
                        className={cn(
                          'hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none disabled:opacity-50',
                          added && 'bg-accent/60',
                        )}
                      >
                        <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm">{option.title}</span>
                          <span className="text-muted-foreground truncate text-xs">
                            {option.detail}
                          </span>
                        </span>
                        {note ? (
                          <span
                            className={cn(
                              'shrink-0 text-[11px]',
                              option.status === 'failed'
                                ? 'text-destructive'
                                : 'text-muted-foreground',
                            )}
                          >
                            {note}
                          </span>
                        ) : null}
                        <Check
                          className={cn('text-primary size-4 shrink-0', !added && 'invisible')}
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  );
};

/**
 * Edits a project: its name, its instructions and its files. Files come from the assistant's
 * Knowledge through the same list the @ picker shows, or are attached here and uploaded into
 * Knowledge the way the paperclip does, with their status on each chip.
 */
export const ProjectDialog = ({ assistantId, project, open, onClose }: ProjectDialogProps) => (
  <Dialog open={open && Boolean(project)} onOpenChange={(next) => (next ? null : onClose())}>
    <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col sm:max-w-lg">
      {project ? (
        <ProjectForm key={project.id} assistantId={assistantId} project={project} onClose={onClose} />
      ) : null}
    </DialogContent>
  </Dialog>
);

/**
 * The dialog's open state for a screen that edits projects. The project stays set while the
 * dialog closes, so its content does not vanish during the closing animation.
 */
export const useProjectDialog = () => {
  const [state, setState] = useState<{ projectId: string; open: boolean } | null>(null);

  return {
    projectId: state?.projectId ?? null,
    open: state?.open ?? false,
    edit: (projectId: string) => setState({ projectId, open: true }),
    close: () => setState((current) => (current ? { ...current, open: false } : current)),
  };
};
