import type { Metadata } from 'next';

import { Thread } from '@/components/chat/thread';

export const metadata: Metadata = { title: 'Chat' };

/**
 * One conversation. Deliberately thin: the thread renders from the client cache, so an id the
 * database has never seen (a chat started a moment ago) still opens at once.
 */
export default async function ConversationPage({
  params,
}: PageProps<'/a/[assistantId]/chat/[conversationId]'>) {
  const { conversationId } = await params;

  return <Thread conversationId={conversationId} />;
}
