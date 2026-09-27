'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { useActionState, useState } from 'react';

import { deleteAccount } from '@/actions/account';
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

import type { DeleteAccountField } from './schema';

/** The last card on the Account page: typing the email address arms the delete button. */
export const DeleteAccountCard = ({ email }: { email: string }) => {
  const [state, action, pending] = useActionState(
    deleteAccount,
    idleState as FormState<DeleteAccountField>,
  );
  const [typed, setTyped] = useState('');
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Delete this account</CardTitle>
        <CardDescription>
          Removes your assistant with its uploaded files, indexed pages, conversations and leads,
          then the account itself. Installed widgets stop answering. There is no undo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 data-icon="inline-start" />
              Delete account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form action={action} noValidate className="contents">
              <DialogHeader>
                <DialogTitle>Delete your account?</DialogTitle>
                <DialogDescription>
                  Everything this account owns will be gone and you will be signed out. Type your
                  email address to confirm.
                </DialogDescription>
              </DialogHeader>
              {state.status === 'error' && state.error && !state.fieldErrors ? (
                <FormMessage tone="error">{state.error}</FormMessage>
              ) : null}
              <FormField label={`Type ${email} to confirm`} error={state.fieldErrors?.confirmEmail}>
                {(control) => (
                  <Input
                    {...control}
                    name="confirmEmail"
                    type="email"
                    autoComplete="off"
                    autoFocus
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    placeholder={email}
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
