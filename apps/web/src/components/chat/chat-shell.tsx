'use client';

import { PanelLeft, SquarePen } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { ConversationList } from '@/components/chat/conversation-list';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useConversations, useConversationsRealtime } from '@/hooks/use-conversations';
import { conversationLabel, type ConversationRow } from '@/lib/chat/conversations';

export type ChatShellProps = {
  assistantId: string;
  conversations: ConversationRow[];
  children: React.ReactNode;
};

/**
 * The two panes of the chat. Fills the viewport beside the app sidebar; only the message list
 * and the conversation list scroll. Below the md breakpoint the list lives in a sheet.
 */
export const ChatShell = ({ assistantId, conversations, children }: ChatShellProps) => {
  const [open, setOpen] = useState(false);
  const params = useParams<{ conversationId?: string }>();
  const { data } = useConversations(assistantId, conversations);

  useConversationsRealtime(assistantId);

  const active = params.conversationId ? data?.find((row) => row.id === params.conversationId) : undefined;
  const title = params.conversationId ? conversationLabel(active ?? { title: null }) : 'New chat';

  return (
    <div className="flex h-[calc(100svh-3rem)] w-full overflow-hidden md:h-svh" data-testid="chat-shell">
      <aside className="bg-sidebar/40 hidden w-70 shrink-0 border-r md:flex md:flex-col">
        <ConversationList assistantId={assistantId} initial={conversations} />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Conversations">
                <PanelLeft />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0" showCloseButton={false}>
              <SheetTitle className="sr-only">Conversations</SheetTitle>
              <ConversationList assistantId={assistantId} initial={conversations} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{title}</span>
          <Button asChild variant="ghost" size="icon-sm" aria-label="New chat">
            <Link href={`/a/${assistantId}/chat`} prefetch>
              <SquarePen />
            </Link>
          </Button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </section>
    </div>
  );
};
