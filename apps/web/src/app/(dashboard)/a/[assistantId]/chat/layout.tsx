import { ChatShell } from '@/components/chat/chat-shell';
import { fetchConversations } from '@/lib/chat/queries';
import { requireUser } from '@/lib/session';

/**
 * The chat's two-pane frame. The conversation list is read here, once, with the visitor's own
 * session and handed to the client cache; every screen under it renders from that cache.
 */
export default async function ChatLayout({ children, params }: LayoutProps<'/a/[assistantId]/chat'>) {
  const { assistantId } = await params;
  const { supabase } = await requireUser();
  const conversations = await fetchConversations(supabase, assistantId);

  return (
    <ChatShell assistantId={assistantId} conversations={conversations}>
      {children}
    </ChatShell>
  );
}
