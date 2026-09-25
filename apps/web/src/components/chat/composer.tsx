'use client';

import { MAX_MESSAGE_LENGTH } from '@parbot/shared';
import { cn } from 'cn';
import { ArrowUp, Square } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { clearDraft, readDraft, writeDraft } from '@/lib/chat/drafts';

export type ComposerProps = {
  /** Where the unsent text is kept between mounts; one per conversation. */
  draftKey: string;
  onSend: (content: string) => void;
  onStop?: () => void;
  streaming?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
};

const MAX_HEIGHT = 200;

const isComposing = (event: React.KeyboardEvent<HTMLTextAreaElement>) =>
  event.nativeEvent.isComposing || event.keyCode === 229;

/**
 * The message box. Enter sends, Shift+Enter breaks the line, and a composition in progress (IME)
 * is never sent by accident. The Stop button takes the Send button's place while an answer streams.
 */
export const Composer = ({
  draftKey,
  onSend,
  onStop,
  streaming = false,
  placeholder = 'Ask about the docs',
  autoFocus = true,
  className,
}: ComposerProps) => {
  const [value, setValue] = useState(() => readDraft(draftKey));
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const canSend = value.trim().length > 0 && !streaming;

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
  }, [resize, value]);

  useEffect(() => {
    if (!autoFocus) {
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

  const submit = useCallback(() => {
    const content = value.trim();

    if (!content || streaming) {
      return;
    }

    setValue('');
    clearDraft(draftKey);
    onSend(content);
    textareaRef.current?.focus();
  }, [value, streaming, draftKey, onSend]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;

    setValue(next);
    writeDraft(draftKey, next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || isComposing(event)) {
      return;
    }

    event.preventDefault();
    submit();
  };

  const remaining = MAX_MESSAGE_LENGTH - value.length;

  return (
    <form
      className={cn('flex flex-col gap-1.5', className)}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="bg-card focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-3 flex items-end gap-2 rounded-xl border p-2 transition-[border-color,box-shadow]">
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
      <div className="text-muted-foreground flex justify-between px-1 text-[11px]">
        <span className="hidden sm:inline">Enter to send, Shift+Enter for a new line</span>
        <span className={cn('ml-auto', remaining < 200 ? 'inline' : 'hidden')} aria-live="polite">
          {remaining} left
        </span>
      </div>
    </form>
  );
};
