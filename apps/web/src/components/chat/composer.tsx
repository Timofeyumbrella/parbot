'use client';

import { MAX_MESSAGE_LENGTH } from '@parbot/shared';
import { cn } from 'cn';
import { ArrowUp, FolderClosed, Paperclip, Square } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  type ComposerChip,
  ComposerReferenceChip,
  ProjectFileChip,
} from '@/components/chat/reference-chips';
import { ReferencePicker } from '@/components/chat/reference-picker';
import { Button } from '@/components/ui/button';
import { clearDraft, handOffFocus, readDraft, takeFocus, writeDraft } from '@/lib/chat/drafts';
import {
  addReference,
  filterReferenceOptions,
  findMention,
  MAX_REFERENCES,
  type MessageReference,
  type ReferenceOption,
  removeMention,
  removeReference,
  toReference,
} from '@/lib/chat/references';
import { UPLOAD_ACCEPT } from '@/lib/uploads';

/** What the composer needs to offer @ references and attachments; left out, it is a plain box. */
export type ComposerReferences = {
  /** The chips the next question carries. */
  chips: ComposerChip[];
  /**
   * The project the conversation is in, and its files: every question reads them, so they show
   * first, and they cannot be taken off here (they change in the project).
   */
  fixed?: { label: string; chips: ComposerChip[] };
  onChange: (references: MessageReference[]) => void;
  /** The picker's list; undefined while it loads. */
  options: ReferenceOption[] | undefined;
  failed?: boolean;
  /** Files picked with the paperclip or dropped on the box. */
  onAttach: (files: File[]) => void;
};

export type ComposerProps = {
  /** Where the unsent text is kept between mounts; one per conversation. */
  draftKey: string;
  /** Called with the text and the references the question carries. */
  onSend: (content: string, references: MessageReference[]) => void;
  onStop?: () => void;
  streaming?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  references?: ComposerReferences;
};

const MAX_HEIGHT = 200;
/** A project's files shown before "N more files", so a big project does not crowd the box. */
const FIXED_SHOWN = 3;

const isComposing = (event: React.KeyboardEvent<HTMLTextAreaElement>) =>
  event.nativeEvent.isComposing || event.keyCode === 229;

/**
 * The message box. Enter sends, Shift+Enter breaks the line, and a composition in progress (IME)
 * is never sent by accident. The Stop button takes the Send button's place while an answer streams.
 *
 * With `references`, an @ opens a picker of the assistant's files and sources (arrows move, Enter
 * or Tab picks, Esc closes) and a picked one becomes a chip above the text; the paperclip uploads
 * a file into Knowledge and adds it as a chip at once, with its status on it.
 */
export const Composer = ({
  draftKey,
  onSend,
  onStop,
  streaming = false,
  placeholder = 'Ask about the docs',
  autoFocus = true,
  className,
  references,
}: ComposerProps) => {
  const [value, setValue] = useState(() => readDraft(draftKey));
  const [caret, setCaret] = useState<number | null>(null);
  /** The @ the reader closed with Esc; the picker stays shut for it until they type another. */
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [active, setActive] = useState({ query: '', index: 0 });
  const [dragging, setDragging] = useState(false);
  const [showAllFixed, setShowAllFixed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const handedFocus = useRef(false);
  const nextCaret = useRef<number | null>(null);
  /**
   * Enter (or Tab) pressed while the picker's list was still loading, for the @ that starts at
   * this index: the first match is picked the moment the list arrives.
   */
  const queuedPick = useRef<number | null>(null);
  const pickerId = useId();
  const canSend = value.trim().length > 0 && !streaming;

  const mention = references && caret !== null ? findMention(value, caret) : null;
  const open = Boolean(mention && mention.start !== dismissed);
  const query = mention?.query ?? '';
  const options = references?.options;
  const filtered = useMemo(
    () => (options ? filterReferenceOptions(options, query) : undefined),
    [options, query],
  );
  // The highlighted row goes back to the top whenever the filter changes.
  const activeIndex = active.query === query ? active.index : 0;
  const optionId = useCallback((index: number) => `${pickerId}-option-${index}`, [pickerId]);
  const referenceChips = references?.chips;
  const chips = useMemo(() => referenceChips ?? [], [referenceChips]);
  const fixed = references?.fixed;
  const fixedIds = useMemo(() => new Set(fixed?.chips.map((chip) => chip.id)), [fixed]);
  // A project's file is read anyway, so the picker shows it as added.
  const selectedIds = useMemo(
    () => new Set([...chips.map((chip) => chip.id), ...fixedIds]),
    [chips, fixedIds],
  );

  const resize = useCallback(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, []);

  useLayoutEffect(() => {
    resize();

    // A pick rewrote the text; the caret goes where the @ was.
    const textarea = textareaRef.current;

    if (textarea && nextCaret.current !== null) {
      textarea.setSelectionRange(nextCaret.current, nextCaret.current);
      nextCaret.current = null;
    }
  }, [resize, value]);

  // A remount for the same conversation (the route taking over from the pane a click rendered,
  // or the loading screen handing over to the page) keeps the reader's focus and caret. It moves
  // in the commit that swaps the boxes: left to the effect below, a key pressed in between went
  // to the page, and an Enter there sent nothing.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const handed = takeFocus(draftKey);

    if (textarea && handed) {
      textarea.focus();
      textarea.setSelectionRange(handed.start, handed.end);
      handedFocus.current = true;
    }

    return () => {
      if (textarea && textarea.ownerDocument.activeElement === textarea) {
        handOffFocus(draftKey, textarea.selectionStart, textarea.selectionEnd);
      }
    };
  }, [draftKey]);

  useEffect(() => {
    if (!autoFocus || handedFocus.current) {
      return;
    }

    // A phone would pop its keyboard over the welcome screen; only a pointer device gets focus.
    const fine =
      typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: fine)').matches : true;

    if (fine) {
      const textarea = textareaRef.current;

      textarea?.focus();
      textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }, [autoFocus]);

  // Arrow keys can move the highlight past the visible rows.
  useEffect(() => {
    if (open) {
      document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex, optionId]);

  const sendableReferences = useCallback(
    () =>
      chips
        .filter((chip) => chip.status !== 'failed' && chip.status !== 'missing')
        .map(toReference),
    [chips],
  );

  const submit = useCallback(() => {
    const content = value.trim();

    if (!content || streaming) {
      return;
    }

    setValue('');
    setCaret(0);
    clearDraft(draftKey);
    onSend(content, sendableReferences());
    textareaRef.current?.focus();
  }, [value, streaming, draftKey, onSend, sendableReferences]);

  const pick = useCallback(
    (option: ReferenceOption) => {
      if (!references || !mention) {
        return;
      }

      const next = removeMention(value, mention, caret ?? value.length);

      nextCaret.current = next.caret;
      setValue(next.text);
      setCaret(next.caret);
      writeDraft(draftKey, next.text);

      if (!fixedIds.has(option.id)) {
        references.onChange(addReference(chips.map(toReference), option));
      }

      textareaRef.current?.focus();
    },
    [references, mention, value, caret, draftKey, fixedIds, chips],
  );

  // A pick asked for while the list loaded lands once it has arrived; a list that failed, or that
  // has nothing for the query, leaves the text as it is. Closing the picker or typing on drops it.
  const loading = open && !filtered && !references?.failed;
  const openMention = open ? (mention?.start ?? null) : null;

  useEffect(() => {
    const queued = queuedPick.current;

    if (queued === null || (queued === openMention && loading)) {
      return;
    }

    queuedPick.current = null;

    const option = queued === openMention ? filtered?.[0] : undefined;

    if (option) {
      pick(option);
    }
  }, [openMention, loading, filtered, pick]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;

    setValue(next);
    setCaret(event.target.selectionStart);
    queuedPick.current = null;
    writeDraft(draftKey, next);

    if (dismissed !== null && !next.includes('@')) {
      setDismissed(null);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && !isComposing(event)) {
      const count = filtered?.length ?? 0;
      const picks = event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey);

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        queuedPick.current = null;
        setDismissed(mention!.start);

        return;
      }

      if (count > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();

        const step = event.key === 'ArrowDown' ? 1 : -1;

        setActive({ query, index: (activeIndex + step + count) % count });

        return;
      }

      if (count > 0 && picks) {
        event.preventDefault();
        pick(filtered![activeIndex]!);

        return;
      }

      if (loading && picks) {
        event.preventDefault();
        queuedPick.current = mention!.start;

        return;
      }

      // The reader is picking a file, not sending: with nothing to pick, Enter keeps the text
      // (Esc closes the list, and the Send button still sends it as written).
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();

        return;
      }
    }

    if (event.key !== 'Enter' || event.shiftKey || isComposing(event)) {
      return;
    }

    event.preventDefault();
    submit();
  };

  const attach = (files: File[]) => {
    if (references && files.length > 0) {
      references.onAttach(files);
      // Straight back to the question, which can go out while the file uploads.
      textareaRef.current?.focus();
    }
  };

  const remaining = MAX_MESSAGE_LENGTH - value.length;
  const full = chips.length >= MAX_REFERENCES;

  return (
    <form
      className={cn('flex flex-col gap-1.5', className)}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onDragOver={
        references
          ? (event) => {
              if (event.dataTransfer.types.includes('Files')) {
                event.preventDefault();
                setDragging(true);
              }
            }
          : undefined
      }
      onDragLeave={references ? () => setDragging(false) : undefined}
      onDrop={
        references
          ? (event) => {
              if (event.dataTransfer.files.length > 0) {
                event.preventDefault();
                setDragging(false);
                attach([...event.dataTransfer.files]);
              }
            }
          : undefined
      }
    >
      <div className="relative">
        {open && references ? (
          <ReferencePicker
            id={pickerId}
            options={filtered}
            failed={references.failed}
            hasSources={(references.options?.length ?? 0) > 0}
            query={query}
            activeIndex={activeIndex}
            selectedIds={selectedIds}
            optionId={optionId}
            onPick={pick}
            onActivate={(index) => setActive({ query, index })}
          />
        ) : null}
        <div
          className={cn(
            'bg-card focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-3 flex flex-col gap-1.5 rounded-xl border p-2 transition-[border-color,box-shadow]',
            dragging && 'border-primary bg-primary/5',
          )}
        >
          {fixed ? (
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label={`Files from the project ${fixed.label}`}
              data-testid="project-context"
            >
              <span
                className="text-muted-foreground inline-flex h-7 min-w-0 items-center gap-1 text-xs"
                title={`This chat is in the project ${fixed.label}. Its files and instructions apply to every question.`}
              >
                <FolderClosed className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="max-w-32 truncate font-medium sm:max-w-48">{fixed.label}</span>
              </span>
              {(showAllFixed ? fixed.chips : fixed.chips.slice(0, FIXED_SHOWN)).map((chip) => (
                <ProjectFileChip key={chip.id} chip={chip} project={fixed.label} />
              ))}
              {fixed.chips.length > FIXED_SHOWN ? (
                <button
                  type="button"
                  onClick={() => setShowAllFixed((shown) => !shown)}
                  aria-expanded={showAllFixed}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 h-7 rounded-md px-1.5 text-xs outline-none focus-visible:ring-2"
                >
                  {showAllFixed
                    ? 'Show fewer'
                    : `${fixed.chips.length - FIXED_SHOWN} more ${fixed.chips.length - FIXED_SHOWN === 1 ? 'file' : 'files'}`}
                </button>
              ) : null}
            </div>
          ) : null}
          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" aria-label="References for the next question">
              {chips.map((chip) => (
                <ComposerReferenceChip
                  key={chip.id}
                  chip={chip}
                  onRemove={(id) =>
                    references?.onChange(removeReference(chips, id).map(toReference))
                  }
                />
              ))}
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            {references ? (
              <>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Attach a file"
                  title={
                    full
                      ? `A question can reference up to ${MAX_REFERENCES} files or sources.`
                      : 'Attach a file'
                  }
                  disabled={full}
                  className="text-muted-foreground"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip />
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={UPLOAD_ACCEPT}
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Choose a file to attach"
                  onChange={(event) => {
                    attach([...(event.target.files ?? [])]);
                    event.target.value = '';
                  }}
                />
              </>
            ) : null}
            <textarea
              ref={textareaRef}
              name="message"
              aria-label="Message"
              rows={1}
              value={value}
              placeholder={placeholder}
              maxLength={MAX_MESSAGE_LENGTH}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
              onBlur={() => setDismissed(mention?.start ?? null)}
              onFocus={() => setDismissed(null)}
              aria-autocomplete={references ? 'list' : undefined}
              aria-controls={open && filtered?.length ? pickerId : undefined}
              aria-activedescendant={open && filtered?.length ? optionId(activeIndex) : undefined}
              className="placeholder:text-muted-foreground max-h-50 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm leading-6 outline-none"
            />
            {streaming ? (
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                aria-label="Stop"
                onClick={onStop}
              >
                <Square className="size-3 fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon-sm" aria-label="Send" disabled={!canSend}>
                <ArrowUp />
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="text-muted-foreground flex justify-between px-1 text-[11px]">
        <span className="hidden sm:inline">
          {references
            ? 'Enter to send, Shift+Enter for a new line, @ to point at a file'
            : 'Enter to send, Shift+Enter for a new line'}
        </span>
        <span className={cn('ml-auto', remaining < 200 ? 'inline' : 'hidden')} aria-live="polite">
          {remaining} left
        </span>
      </div>
    </form>
  );
};
