'use client';

import { UUID_PATTERN } from '@parbot/shared';
import { cn } from 'cn';
import { FolderOpen, FolderX, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { useAssistant } from '@/components/assistant-context';
import { useChatSelection } from '@/components/chat/chat-context';
import { ChatComposer } from '@/components/chat/chat-composer';
import { ComposerSkeleton } from '@/components/chat/chat-skeletons';
import { ProjectDialog, useProjectDialog } from '@/components/chat/project-dialog';
import { type ComposerChip } from '@/components/chat/reference-chips';
import { Thread } from '@/components/chat/thread';
import { SOURCE_KINDS } from '@/components/knowledge/format';
import { isPlainLeftClick } from '@/components/nav-pending';
import { Button } from '@/components/ui/button';
import { useConversationListCache } from '@/hooks/use-conversations';
import { useProjectRow } from '@/hooks/use-projects';
import { useReferenceChips } from '@/hooks/use-reference-sources';
import { usePrefetchThread } from '@/hooks/use-thread';
import { useSendMessage } from '@/hooks/use-send-message';
import { conversationLabel } from '@/lib/chat/conversations';
import { instructionsSummary } from '@/lib/chat/projects';
import { CHIP_STATUS_LABEL, type MessageReference } from '@/lib/chat/references';
import { relativeTime } from '@/lib/format';
import { sourceHref } from '@/lib/knowledge/links';

export type ProjectHomeProps = { projectId: string };

/** A new chat in a project has no references of its own until its first question brings some. */
const NO_REFERENCES: MessageReference[] = [];

const RECENT_CHATS = 8;

/** A project file on its home: opens the file's text, and says whether it can be read yet. */
const FileLink = ({ chip, assistantId }: { chip: ComposerChip; assistantId: string }) => {
  const Icon = SOURCE_KINDS[chip.kind].icon;
  const note = chip.status === 'ready' ? null : CHIP_STATUS_LABEL[chip.status];

  return (
    <li className="min-w-0 max-w-full">
      <Link
        href={sourceHref(assistantId, chip.id)}
        className={cn(
          'bg-card hover:bg-muted inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
          (chip.status === 'failed' || chip.status === 'missing') && 'border-destructive/40',
        )}
        data-testid="project-file"
        data-status={chip.status}
      >
        <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate font-medium">{chip.title}</span>
        {note ? (
          <span
            className={cn(
              'shrink-0 text-[11px]',
              chip.status === 'failed' || chip.status === 'missing'
                ? 'text-destructive'
                : 'text-muted-foreground',
            )}
          >
            {note}
          </span>
        ) : null}
      </Link>
    </li>
  );
};

const HomeSkeleton = () => (
  <div
    className="flex h-full min-h-0 flex-col"
    data-testid="project-home-loading"
    aria-hidden="true"
  >
    <div className="min-h-0 flex-1 overflow-hidden">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="bg-muted size-10 rounded-lg" />
          <div className="sheen h-5 w-40 rounded-md" />
        </div>
        <div className="sheen h-3.5 w-3/4 rounded-md" />
        <div className="sheen h-3.5 w-1/2 rounded-md" />
        <div className="flex gap-2">
          <div className="sheen h-7 w-28 rounded-md" />
          <div className="sheen h-7 w-36 rounded-md" />
        </div>
      </div>
    </div>
    <div className="bg-background border-t px-4 pb-3 pt-3 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <ComposerSkeleton />
      </div>
    </div>
  </div>
);

/**
 * A project's home: its name, what its instructions say, its files, its recent chats, and a
 * composer that starts a new chat in it. Sending works like New chat (the conversation id is made
 * here, the thread shows in place and the URL follows), with the project named on the request.
 */
export const ProjectHome = ({ projectId }: ProjectHomeProps) => {
  const assistant = useAssistant();
  const router = useRouter();
  const selection = useChatSelection();
  const prefetchThread = usePrefetchThread();
  const { send } = useSendMessage(assistant.id);
  const valid = UUID_PATTERN.test(projectId);
  const project = useProjectRow(assistant.id, valid ? projectId : null);
  const conversations = useConversationListCache(assistant.id);
  const dialog = useProjectDialog();
  const [started, setStarted] = useState<string | null>(null);
  const files = project?.sources ?? NO_REFERENCES;
  const { fixedChips } = useReferenceChips(assistant.id, NO_REFERENCES, files);
  const chats = useMemo(
    () => (conversations ?? []).filter((row) => row.project_id === projectId),
    [conversations, projectId],
  );

  const start = useCallback(
    (content: string, references?: MessageReference[]) => {
      const conversationId = crypto.randomUUID();

      void send({ conversationId, content, references, projectId });
      setStarted(conversationId);
      router.push(`/a/${assistant.id}/chat/${conversationId}`);
    },
    [send, router, assistant.id, projectId],
  );

  if (started) {
    return <Thread conversationId={started} />;
  }

  if (!valid || project === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <FolderX className="text-muted-foreground size-6" aria-hidden="true" />
        <p className="text-sm font-medium">This project no longer exists.</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          It may have been deleted in another tab. Its chats, if it had any, are under Chats.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/a/${assistant.id}/chat`}>New chat</Link>
        </Button>
      </div>
    );
  }

  if (project === undefined) {
    return <HomeSkeleton />;
  }

  const summary = instructionsSummary(project.instructions);
  const base = `/a/${assistant.id}/chat`;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="project-home">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
          <header className="flex items-start gap-3">
            <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
              <FolderOpen className="size-5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h1 className="truncate text-lg font-semibold tracking-tight">{project.name}</h1>
              <p className="text-muted-foreground text-sm">
                Every chat here reads the project&apos;s files and follows its instructions.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => dialog.edit(project.id)}
            >
              <SlidersHorizontal data-icon="inline-start" />
              <span className="hidden sm:inline">Edit project</span>
              <span className="sm:hidden">Edit</span>
            </Button>
          </header>

          <section className="flex flex-col gap-1.5" aria-label="Instructions">
            <h2 className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
              Instructions
            </h2>
            {summary ? (
              <p className="text-sm" data-testid="project-instructions">
                {summary}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                None yet. Add some in Edit project to shape how chats here answer, for example which
                team they are for.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-1.5" aria-label="Files">
            <h2 className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
              Files
            </h2>
            {fixedChips.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {fixedChips.map((chip) => (
                  <FileLink key={chip.id} chip={chip} assistantId={assistant.id} />
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                None yet. Add files in Edit project and every chat here reads them first.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-1.5" aria-label="Chats in this project">
            <h2 className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
              Chats
            </h2>
            {chats.length > 0 ? (
              <ul className="divide-y rounded-lg border">
                {chats.slice(0, RECENT_CHATS).map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`${base}/${row.id}`}
                      prefetch={false}
                      onPointerEnter={() => prefetchThread(row.id)}
                      onFocus={() => prefetchThread(row.id)}
                      onClick={(event) => {
                        if (isPlainLeftClick(event)) {
                          selection?.select(row.id);
                        }
                      }}
                      className="hover:bg-muted/60 flex items-center gap-3 px-3 py-2.5 text-sm transition-colors"
                    >
                      <span className="min-w-0 flex-1 truncate">{conversationLabel(row)}</span>
                      <span
                        className="text-muted-foreground shrink-0 text-xs tabular-nums"
                        suppressHydrationWarning
                      >
                        {row.last_message_at ? relativeTime(row.last_message_at) : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                No chats yet. Ask something below to start the first one.
              </p>
            )}
          </section>
        </div>
      </div>

      <div className="bg-background border-t px-4 pb-3 pt-3 sm:px-6">
        <ChatComposer
          className="mx-auto w-full max-w-3xl"
          draftKey={`project:${projectId}`}
          conversationReferences={NO_REFERENCES}
          projectId={projectId}
          onSend={start}
        />
      </div>

      <ProjectDialog
        assistantId={assistant.id}
        project={project}
        open={dialog.open}
        onClose={dialog.close}
      />
    </div>
  );
};
