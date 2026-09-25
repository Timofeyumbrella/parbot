'use client';

import { KeyRound, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { regeneratePublicKey } from '@/actions/assistants';
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

export const RegenerateKeyCard = ({
  assistantId,
  publicKey,
}: {
  assistantId: string;
  publicKey: string;
}) => {
  const [key, setKey] = useState(publicKey);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const regenerate = () =>
    startTransition(async () => {
      const result = await regeneratePublicKey(assistantId);

      if (result.ok) {
        setKey(result.publicKey);
        setOpen(false);
        toast.success(
          'New public key generated. Update the snippet wherever the widget is installed.',
        );
      } else {
        toast.error(result.error);
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public key</CardTitle>
        <CardDescription>
          Identifies this assistant in the widget snippet and the demo page. It is safe to publish.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <code
          className="bg-muted break-all rounded-md px-2 py-1 font-mono text-xs"
          data-testid="public-key"
        >
          {key}
        </code>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <KeyRound data-icon="inline-start" />
              Regenerate
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Regenerate the public key?</DialogTitle>
              <DialogDescription>
                Every installed widget uses the current key. They stop answering until you update
                the snippet with the new one. The demo page link changes too.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button onClick={regenerate} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Regenerate key
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
