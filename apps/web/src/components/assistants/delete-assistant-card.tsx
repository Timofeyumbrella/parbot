'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { useActionState, useState } from 'react';

import { deleteAssistant } from '@/actions/assistants';
import { FormField, FormMessage } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import { type FormState, idleState } from '@/lib/form';

import type { DeleteField } from './schema';

export const DeleteAssistantCard = ({ assistantId, name }: { assistantId: string; name: string }) => {
  const [state, action, pending] = useActionState(deleteAssistant, idleState as FormState<DeleteField>);
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === name;

  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Delete this assistant</CardTitle>
        <CardDescription>
          Removes its sources, indexed pages, conversations and leads. Installed widgets stop answering. There is
          no undo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 data-icon="inline-start" />
              Delete assistant
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form action={action} noValidate className="contents">
              <input type="hidden" name="assistantId" value={assistantId} />
              <DialogHeader>
                <DialogTitle>Delete {name}?</DialogTitle>
                <DialogDescription>
                  Everything this assistant indexed and every conversation it had will be gone. Type its name to
                  confirm.
                </DialogDescription>
              </DialogHeader>
              {state.status === 'error' && state.error && !state.fieldErrors ? (
                <FormMessage tone="error">{state.error}</FormMessage>
              ) : null}
              <FormField label={`Type ${name} to confirm`} error={state.fieldErrors?.confirmName}>
                {(control) => (
                  <Input
                    {...control}
                    name="confirmName"
                    autoComplete="off"
                    autoFocus
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    placeholder={name}
                  />
                )}
              </FormField>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" variant="destructive" disabled={!matches || pending}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  Delete for good
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
