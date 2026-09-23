'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useState } from 'react';
import { toast } from 'sonner';

import { deleteConversation, type DeleteConversationState } from '@/app/(dashboard)/a/[assistantId]/inbox/[conversationId]/actions';
import { conversationListKey } from '@/components/inbox/conversation-query';
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
 * A destructive action behind a confirmation dialog. On success the cached inbox lists are
 * dropped before going back, because Realtime cannot deliver a filtered DELETE for the row.
 */
export const DeleteConversation = ({ assistantId, conversationId }: { assistantId: string; conversationId: string }) => {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, action, pending] = useActionState(
    async (previous: DeleteConversationState, formData: FormData) => {
      const result = await deleteConversation(previous, formData);

      if (result.deleted) {
        queryClient.removeQueries({ queryKey: conversationListKey(assistantId) });
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
