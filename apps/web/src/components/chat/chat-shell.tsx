'use client';

import { PanelLeft, SquarePen } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { NewChat } from '@/components/chat/new-chat';
import { Thread } from '@/components/chat/thread';
import { isPlainLeftClick } from '@/components/nav-pending';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useConversationRow, useConversationsRealtime } from '@/hooks/use-conversations';
import { conversationLabel } from '@/lib/chat/conversations';

type ChatPane = { onNavigate?: () => void };

const ChatPaneContext = createContext<ChatPane>({});

/** What the pane a conversation list sits in wants to know: on a phone, that a link was followed. */
export const useChatPane = () => useContext(ChatPaneContext);

type ChatSelection = {
  /** The conversation on screen: the one just clicked, else the route's. Null is a new chat. */
  selectedId: string | null;
  /** Shows a conversation (or a new chat, with null) at once; the link's navigation follows. */
  select: (conversationId: string | null) => void;
};

const ChatSelectionContext = createContext<ChatSelection | null>(null);

/** The shell's selection, or null outside a shell (the list then follows the route alone). */
export const useChatSelection = () => useContext(ChatSelectionContext);

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
 *
 * A click in the list selects on the client, in the click frame. The router can show the new
 * route at once only after it has prefetched that exact URL, which takes a second or two after a
 * page load; until then it would wait a whole round trip with nothing changing. The picked
 * conversation renders here straight away (from the thread cache, or behind its skeleton) and
 * the route takes over as soon as it moves.
 */
export const ChatShell = ({ assistantId, list, children }: ChatShellProps) => {
  const params = useParams<{ conversationId?: string }>();
  const routed = params.conversationId ?? null;
  // `fresh` tells one New chat from the next, so each click starts a blank screen.
  const [picked, setPicked] = useState<{ id: string | null; fresh: number } | null>(null);
  const [route, setRoute] = useState(routed);

  // The route moved (the pick landed, or the reader went elsewhere): the route is the truth again.
  if (route !== routed) {
    setRoute(routed);
    setPicked(null);
  }

  const conversationId = picked ? picked.id : routed;
  // New chat never defers to the route, even on the new chat URL: a chat just started there shows
  // its thread until the router has moved to the chat's own URL, a round trip after a page load.
  const select = useCallback(
    (id: string | null) =>
      setPicked((current) =>
        id !== null && id === routed ? null : { id, fresh: (current?.fresh ?? 0) + 1 },
      ),
    [routed],
  );
  const selection = useMemo(
    () => ({ selectedId: conversationId, select }),
    [conversationId, select],
  );

  // The sheet remembers which route it was opened on, so a route change closes it without an effect.
  const [openedOn, setOpenedOn] = useState<string | null | false>(false);
  const open = openedOn !== false && openedOn === conversationId;
  const setOpen = (next: boolean) => setOpenedOn(next ? conversationId : false);
  const active = useConversationRow(assistantId, conversationId);
  const title = conversationId ? conversationLabel(active ?? { title: null }) : 'New chat';

  useConversationsRealtime(assistantId);

  const sheetPane = useMemo<ChatPane>(() => ({ onNavigate: () => setOpenedOn(false) }), []);

  return (
    <ChatSelectionContext.Provider value={selection}>
      <div
        className="flex h-[calc(100svh-3rem)] w-full overflow-hidden md:h-svh"
        data-testid="chat-shell"
      >
        <aside className="bg-sidebar/40 w-70 hidden shrink-0 border-r md:flex md:flex-col">
          {list}
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
                <ChatPaneContext.Provider value={sheetPane}>{list}</ChatPaneContext.Provider>
              </SheetContent>
            </Sheet>
            <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{title}</span>
            <Button asChild variant="ghost" size="icon-sm" aria-label="New chat">
              <Link
                href={`/a/${assistantId}/chat`}
                onClick={(event) => {
                  if (isPlainLeftClick(event)) {
                    select(null);
                  }
                }}
              >
                <SquarePen />
              </Link>
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            {picked ? (
              picked.id ? (
                <Thread key={picked.id} conversationId={picked.id} />
              ) : (
                <NewChat key={picked.fresh} />
              )
            ) : (
              children
            )}
          </div>
        </section>
      </div>
    </ChatSelectionContext.Provider>
  );
};
