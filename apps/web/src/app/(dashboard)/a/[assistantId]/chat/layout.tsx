import { Suspense } from 'react';

import { ChatShell } from '@/components/chat/chat-shell';
import { ConversationListSkeleton } from '@/components/chat/chat-skeletons';
import { ConversationList } from '@/components/chat/conversation-list';
import { readConversationSnapshot, readProjectSnapshot } from '@/lib/chat/queries';
import { requireUser } from '@/lib/session';

/** Reads the list and the projects with the visitor's own session and seeds the client cache. */
async function ConversationPane({ assistantId }: { assistantId: string }) {
  const { supabase } = await requireUser();
  const [snapshot, projectSnapshot] = await Promise.all([
    readConversationSnapshot(supabase, assistantId),
    readProjectSnapshot(supabase, assistantId),
  ]);

  return (
    <ConversationList
      assistantId={assistantId}
      snapshot={snapshot}
      projectSnapshot={projectSnapshot}
    />
  );
}

/**
 * The chat's two-pane frame. The frame itself needs nothing from the database, so it paints on
 * the first byte; the conversation list streams into its pane behind a skeleton. Every screen
 * under it renders from the cache the list seeds.
 */
export default async function ChatLayout({
  children,
  params,
}: LayoutProps<'/a/[assistantId]/chat'>) {
  const { assistantId } = await params;

  return (
    <ChatShell
      assistantId={assistantId}
      list={
        <Suspense fallback={<ConversationListSkeleton />}>
          <ConversationPane assistantId={assistantId} />
        </Suspense>
      }
    >
      {children}
    </ChatShell>
  );
}
