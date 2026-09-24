'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useState } from 'react';
import { toast } from 'sonner';

import { deleteConversation, type DeleteConversationState } from '@/app/(dashboard)/a/[assistantId]/inbox/[conversationId]/actions';
import { inboxKey } from '@/components/inbox/conversation-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const initialState: DeleteConversationState = {};

/**
 * A destructive action behind a confirmation dialog. On success every cached list that could
 * still hold the row is dropped before going back: the inbox lists, because Realtime cannot
 * deliver a filtered DELETE, and the chat's list and thread, which live in their own namespace.
 */
export const DeleteConversation = ({ assistantId, conversationId }: { assistantId: string; conversationId: string }) => {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, action, pending] = useActionState(
    async (previous: DeleteConversationState, formData: FormData) => {
      let result: DeleteConversationState;

      try {
        result = await deleteConversation(previous, formData);
      } catch {
        return { error: 'The conversation could not be deleted. Check your connection and try again.' };
      }

      if (result.deleted) {
        queryClient.removeQueries({ queryKey: inboxKey(assistantId) });
        queryClient.removeQueries({ queryKey: ['thread', conversationId] });
        void queryClient.invalidateQueries({ queryKey: ['chat'] });
        toast.success('Conversation deleted');
        router.replace(`/a/${assistantId}/inbox`);
      }

      return result;
    },
    initialState,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="w-full">
          <Trash2 aria-hidden="true" />
          Delete conversation
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this conversation?</DialogTitle>
          <DialogDescription>
            The transcript and its messages are removed for good. Linked leads stay in the inbox without a
            conversation.
          </DialogDescription>
        </DialogHeader>
        {state.error ? (
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        ) : null}
        <form action={action}>
          <input type="hidden" name="assistantId" value={assistantId} />
          <input type="hidden" name="conversationId" value={conversationId} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Keep it
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending || Boolean(state.deleted)}>
              {pending || state.deleted ? 'Deleting' : 'Delete'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
