'use client';

import { PanelLeft, SquarePen } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createContext, useContext, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useConversationRow, useConversationsRealtime } from '@/hooks/use-conversations';
import { conversationLabel } from '@/lib/chat/conversations';

type ChatPane = { onNavigate?: () => void };

const ChatPaneContext = createContext<ChatPane>({});

/** What the pane a conversation list sits in wants to know: on a phone, that a link was followed. */
export const useChatPane = () => useContext(ChatPaneContext);

export type ChatShellProps = {
  assistantId: string;
  /** The conversation pane, streamed by the layout. Rendered in the aside and again in the sheet. */
  list: React.ReactNode;
  children: React.ReactNode;
};

/**
 * The two panes of the chat. Fills the viewport beside the app sidebar (and below its bar on a
 * phone); only the message list and the conversation list scroll. Below the md breakpoint the
 * list lives in a sheet that closes when the route changes.
 */
export const ChatShell = ({ assistantId, list, children }: ChatShellProps) => {
  const params = useParams<{ conversationId?: string }>();
  const conversationId = params.conversationId ?? null;
  // The sheet remembers which route it was opened on, so a route change closes it without an effect.
  const [openedOn, setOpenedOn] = useState<string | null | false>(false);
  const open = openedOn !== false && openedOn === conversationId;
  const setOpen = (next: boolean) => setOpenedOn(next ? conversationId : false);
  const active = useConversationRow(assistantId, conversationId);
  const title = conversationId ? conversationLabel(active ?? { title: null }) : 'New chat';

  useConversationsRealtime(assistantId);

  const sheetPane = useMemo<ChatPane>(() => ({ onNavigate: () => setOpenedOn(false) }), []);

  return (
    <div className="flex h-[calc(100svh-3rem)] w-full overflow-hidden md:h-svh" data-testid="chat-shell">
      <aside className="bg-sidebar/40 hidden w-70 shrink-0 border-r md:flex md:flex-col">{list}</aside>

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
              <ChatPaneContext.Provider value={sheetPane}>{list}</ChatPaneContext.Provider>
            </SheetContent>
          </Sheet>
          <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{title}</span>
          <Button asChild variant="ghost" size="icon-sm" aria-label="New chat">
            <Link href={`/a/${assistantId}/chat`}>
              <SquarePen />
            </Link>
          </Button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </section>
    </div>
  );
};
