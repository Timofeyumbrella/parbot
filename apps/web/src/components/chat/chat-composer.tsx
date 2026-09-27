'use client';

import { useCallback, useState } from 'react';

import { useAssistant } from '@/components/assistant-context';
import { Composer } from '@/components/chat/composer';
import { useProjectRow } from '@/hooks/use-projects';
import { useAttachFiles, useReferenceChips } from '@/hooks/use-reference-sources';
import { readReferenceDraft, writeReferenceDraft } from '@/lib/chat/drafts';
import { type DraftReference, MAX_REFERENCES, type MessageReference } from '@/lib/chat/references';

export type ChatComposerProps = {
  draftKey: string;
  /** The conversation's references, which the next question keeps unless the reader removes one. */
  conversationReferences: MessageReference[];
  /**
   * The project the conversation is in (or starts in). Its files show as fixed chips: every
   * question reads them, and they change in the project, not here.
   */
  projectId?: string | null;
  onSend: (content: string, references: MessageReference[]) => void;
  onStop?: () => void;
  streaming?: boolean;
  className?: string;
};

const NO_FILES: MessageReference[] = [];

/**
 * The chat's composer with references wired in: the @ picker reads the assistant's sources, the
 * paperclip uploads into Knowledge, and each chip shows where its file is (Uploading, Indexing,
 * Ready, Failed). The chips start as the conversation's references, so a follow-up keeps reading
 * the file the first question named; what the reader changes is kept per conversation until sent.
 * In a project, the project's files come first as chips that cannot be removed here.
 */
export const ChatComposer = ({
  draftKey,
  conversationReferences,
  projectId,
  onSend,
  onStop,
  streaming,
  className,
}: ChatComposerProps) => {
  const assistant = useAssistant();
  const project = useProjectRow(assistant.id, projectId);
  const [edited, setEdited] = useState(() => readReferenceDraft(draftKey));
  const references = edited ?? conversationReferences;
  const { chips, fixedChips, sources } = useReferenceChips(
    assistant.id,
    references,
    project?.sources ?? NO_FILES,
  );
  const attachFiles = useAttachFiles(assistant.id);

  const change = useCallback(
    (next: DraftReference[]) => {
      setEdited(next);
      writeReferenceDraft(draftKey, next);
    },
    [draftKey],
  );

  const attach = (files: File[]) =>
    change(
      attachFiles(files, references, {
        limit: MAX_REFERENCES,
        limitMessage: `A question can reference up to ${MAX_REFERENCES} files or sources.`,
      }),
    );

  const send = (content: string, sent: MessageReference[]) => {
    onSend(content, sent);
    // From here the conversation's own references (the ones just sent) are the chips.
    setEdited(null);
    writeReferenceDraft(draftKey, null);
  };

  return (
    <Composer
      className={className}
      draftKey={draftKey}
      onSend={send}
      onStop={onStop}
      streaming={streaming}
      references={{
        chips,
        fixed: project ? { label: project.name, chips: fixedChips } : undefined,
        onChange: change,
        options: sources.data,
        failed: sources.isError && !sources.data,
        onAttach: attach,
      }}
    />
  );
};
