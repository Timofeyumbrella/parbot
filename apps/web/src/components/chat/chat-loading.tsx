'use client';

import { useParams } from 'next/navigation';

import { ComposerSkeleton, WelcomeSkeleton } from '@/components/chat/chat-skeletons';
import { ProjectHome } from '@/components/chat/project-home';
import { Thread } from '@/components/chat/thread';

/**
 * What the chat routes show while the router fetches a page. A conversation route renders the
 * real thread straight from the cache (the page that follows renders the same thing), so a
 * click on a conversation never shows a route-level skeleton; a project's home does the same.
 * The new chat route shows its shape.
 */
export const ChatLoading = () => {
  const params = useParams<{ conversationId?: string; projectId?: string }>();

  if (params.conversationId) {
    return <Thread conversationId={params.conversationId} />;
  }

  if (params.projectId) {
    return <ProjectHome projectId={params.projectId} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-loading">
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
          <WelcomeSkeleton />
        </div>
      </div>
      <div className="bg-background border-t px-4 pb-3 pt-3 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <ComposerSkeleton />
        </div>
      </div>
    </div>
  );
};
