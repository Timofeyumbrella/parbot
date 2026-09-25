'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { useAssistant } from '@/components/assistant-context';
import { Composer } from '@/components/chat/composer';
import { Thread } from '@/components/chat/thread';
import { Welcome } from '@/components/chat/welcome';
import { useSendMessage } from '@/hooks/use-send-message';
import { NEW_CHAT_DRAFT } from '@/lib/chat/drafts';

/**
 * The screen behind "New chat". Sending mints the conversation id here, puts the exchange in the
 * cache, shows the thread in place and moves the URL, all before the request leaves. Whatever the
 * router renders next reads the same cache, so nothing waits on the server.
 */
export const NewChat = () => {
  const assistant = useAssistant();
  const router = useRouter();
  const { send } = useSendMessage(assistant.id);
  const [started, setStarted] = useState<string | null>(null);

  const start = useCallback(
    (content: string) => {
      const conversationId = crypto.randomUUID();

      void send({ conversationId, content });
      setStarted(conversationId);
      router.push(`/a/${assistant.id}/chat/${conversationId}`);
    },
    [send, router, assistant.id],
  );

  if (started) {
    return <Thread conversationId={started} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="new-chat">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
          <Welcome assistant={assistant} onPick={start} />
        </div>
      </div>
      <div className="bg-background border-t px-4 pb-3 pt-3 sm:px-6">
        <Composer className="mx-auto w-full max-w-3xl" draftKey={NEW_CHAT_DRAFT} onSend={start} />
      </div>
    </div>
  );
};
