'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import { useAssistant } from '@/components/assistant-context';
import { Composer } from '@/components/chat/composer';
import type { ComposerChip } from '@/components/chat/reference-chips';
import { upsertReferenceOption, useReferenceSources } from '@/hooks/use-reference-sources';
import { readReferenceDraft, writeReferenceDraft } from '@/lib/chat/drafts';
import {
  addReference,
  chipStatus,
  MAX_REFERENCES,
  type MessageReference,
} from '@/lib/chat/references';
import { composerUploads } from '@/lib/chat/uploads';
import { uploadProblem } from '@/lib/uploads';

export type ChatComposerProps = {
  draftKey: string;
  /** The conversation's references, which the next question keeps unless the reader removes one. */
  conversationReferences: MessageReference[];
  onSend: (content: string, references: MessageReference[]) => void;
  onStop?: () => void;
  streaming?: boolean;
  className?: string;
};

/** Knowledge lists sources under its own keys; a file attached here should show there too. */
const KNOWLEDGE_NAMESPACE = ['knowledge'] as const;

const serverSnapshot = () => 0;

/**
 * The chat's composer with references wired in: the @ picker reads the assistant's sources, the
 * paperclip uploads into Knowledge, and each chip shows where its file is (Uploading, Indexing,
 * Ready, Failed). The chips start as the conversation's references, so a follow-up keeps reading
 * the file the first question named; what the reader changes is kept per conversation until sent.
 */
export const ChatComposer = ({
  draftKey,
  conversationReferences,
  onSend,
  onStop,
  streaming,
  className,
}: ChatComposerProps) => {
  const assistant = useAssistant();
  const queryClient = useQueryClient();
  const [edited, setEdited] = useState(() => readReferenceDraft(draftKey));
  const references = edited ?? conversationReferences;
  const sources = useReferenceSources(
    assistant.id,
    references.map((reference) => reference.id),
  );
  // Chip statuses follow uploads as they finish.
  useSyncExternalStore(composerUploads.subscribe, composerUploads.version, serverSnapshot);

  const byId = useMemo(
    () => new Map((sources.data ?? []).map((option) => [option.id, option])),
    [sources.data],
  );
  const chips: ComposerChip[] = references.map((reference) => {
    const upload = composerUploads.state(reference.id);

    return {
      ...reference,
      status: chipStatus({
        upload,
        source: byId.get(reference.id),
        loaded: sources.isSuccess,
      }),
      error: upload?.status === 'failed' ? upload.error : undefined,
    };
  });

  const change = useCallback(
    (next: MessageReference[]) => {
      setEdited(next);
      writeReferenceDraft(draftKey, next);
    },
    [draftKey],
  );

  const attach = (files: File[]) => {
    let next = references;

    for (const file of files) {
      const problem = uploadProblem(file);

      if (problem) {
        toast.error(`${file.name} was not attached. ${problem}`);
        continue;
      }

      if (next.length >= MAX_REFERENCES) {
        toast.error(`A question can reference up to ${MAX_REFERENCES} files or sources.`);
        break;
      }

      const reference: MessageReference = {
        id: crypto.randomUUID(),
        title: file.name.slice(0, 200),
        kind: 'upload',
      };

      next = addReference(next, reference);
      void composerUploads.start(
        { id: reference.id, assistantId: assistant.id, file },
        {
          onSaved: (source) => {
            upsertReferenceOption(queryClient, assistant.id, source);
            void queryClient.invalidateQueries({ queryKey: KNOWLEDGE_NAMESPACE });
          },
          onFailed: (error) => toast.error(`${reference.title} could not be uploaded. ${error}`),
        },
      );
    }

    change(next);
  };

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
        onChange: change,
        options: sources.data,
        failed: sources.isError && !sources.data,
        onAttach: attach,
      }}
    />
  );
};
