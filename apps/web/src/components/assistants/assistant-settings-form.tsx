'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';

import { updateAssistant } from '@/actions/assistants';
import { FormField, FormMessage } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { type FormState, idleState } from '@/lib/form';

import {
  DESCRIPTION_MAX_LENGTH,
  INSTRUCTIONS_MAX_LENGTH,
  NAME_MAX_LENGTH,
  SLUG_HELP,
  type UpdateField,
} from './schema';

export type SettingsAssistant = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  instructions: string | null;
};

export const AssistantSettingsForm = ({ assistant }: { assistant: SettingsAssistant }) => {
  const [state, action, pending] = useActionState(
    updateAssistant,
    idleState as FormState<UpdateField>,
  );

  useEffect(() => {
    if (state.status === 'success' && state.message) {
      toast.success(state.message);
    }
  }, [state]);

  // After a failed submit the visitor's edits win; otherwise the saved row does.
  const value = (field: Exclude<UpdateField, 'assistantId'>, saved: string) =>
    state.values?.[field] ?? saved;

  return (
    <form action={action} noValidate>
      <input type="hidden" name="assistantId" value={assistant.id} />
      <Card>
        <CardHeader>
          <CardTitle>Assistant</CardTitle>
          <CardDescription>
            The name and slug identify it. The instructions shape every answer it gives.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {state.status === 'error' && state.error && !state.fieldErrors ? (
            <FormMessage tone="error">{state.error}</FormMessage>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Name" error={state.fieldErrors?.name}>
              {(control) => (
                <Input
                  {...control}
                  name="name"
                  maxLength={NAME_MAX_LENGTH}
                  defaultValue={value('name', assistant.name)}
                />
              )}
            </FormField>
            <FormField label="Slug" hint={SLUG_HELP} error={state.fieldErrors?.slug}>
              {(control) => (
                <Input
                  {...control}
                  name="slug"
                  className="font-mono"
                  defaultValue={value('slug', assistant.slug)}
                  spellCheck={false}
                />
              )}
            </FormField>
          </div>
          <FormField
            label="Description"
            hint="A note for you. Visitors never see it."
            error={state.fieldErrors?.description}
          >
            {(control) => (
              <Textarea
                {...control}
                name="description"
                rows={2}
                maxLength={DESCRIPTION_MAX_LENGTH}
                defaultValue={value('description', assistant.description ?? '')}
              />
            )}
          </FormField>
          <FormField
            label="Instructions"
            hint="Appended to the system prompt on every answer. Use it for tone, the product name, or things to always mention. The assistant still answers only from the docs."
            error={state.fieldErrors?.instructions}
          >
            {(control) => (
              <Textarea
                {...control}
                name="instructions"
                rows={5}
                maxLength={INSTRUCTIONS_MAX_LENGTH}
                defaultValue={value('instructions', assistant.instructions ?? '')}
                placeholder="Call the product Acme, never ACME. Keep a friendly, direct tone. When a question is about billing, point to the pricing page."
              />
            )}
          </FormField>
          <div className="flex flex-col gap-3 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-medium">Welcome message and suggested questions</p>
              <p className="text-muted-foreground text-xs">
                Readers see them in the widget, so they are edited on the Widget page next to its
                live preview.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
              <Link href={`/a/${assistant.id}/widget`}>
                Edit on Widget
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Save changes
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
};
