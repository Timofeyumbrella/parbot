import type { Metadata } from 'next';

import { NewChat } from '@/components/chat/new-chat';

export const metadata: Metadata = { title: 'Chat' };

/** The "new chat" screen. Nothing is read here: the assistant comes from the layout above. */
export default function ChatPage() {
  return <NewChat />;
}
