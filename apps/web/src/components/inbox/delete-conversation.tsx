'use client';

import { Trash2 } from 'lucide-react';
import { useActionState, useState } from 'react';

import { deleteConversation, type DeleteConversationState } from '@/app/(dashboard)/a/[assistantId]/inbox/[conversationId]/actions';
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

/** A destructive action behind a confirmation dialog; the server action redirects on success. */
export const DeleteConversation = ({ assistantId, conversationId }: { assistantId: string; conversationId: string }) => {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteConversation, initialState);

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
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? 'Deleting' : 'Delete'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
