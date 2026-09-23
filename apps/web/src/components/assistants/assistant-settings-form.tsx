'use client';

import { Loader2 } from 'lucide-react';
import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';

import { updateAssistant } from '@/actions/assistants';
import { FormField, FormMessage } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { type FormState, idleState } from '@/lib/form';

import {
  DESCRIPTION_MAX_LENGTH,
  INSTRUCTIONS_MAX_LENGTH,
  NAME_MAX_LENGTH,
  SLUG_HELP,
  SUGGESTED_QUESTION_MAX_LENGTH,
  SUGGESTED_QUESTIONS_MAX,
  type UpdateField,
  WELCOME_MAX_LENGTH,
} from './schema';

export type SettingsAssistant = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  instructions: string | null;
  welcome_message: string;
  suggested_questions: string[];
};

export const AssistantSettingsForm = ({ assistant }: { assistant: SettingsAssistant }) => {
  const [state, action, pending] = useActionState(updateAssistant, idleState as FormState<UpdateField>);

  useEffect(() => {
    if (state.status === 'success' && state.message) {
      toast.success(state.message);
    }
  }, [state]);

  // After a failed submit the visitor's edits win; otherwise the saved row does.
  const value = (field: Exclude<UpdateField, 'assistantId'>, saved: string) => state.values?.[field] ?? saved;

  return (
    <form action={action} noValidate>
      <input type="hidden" name="assistantId" value={assistant.id} />
      <Card>
        <CardHeader>
          <CardTitle>Assistant</CardTitle>
          <CardDescription>
            What visitors see and how the assistant behaves. Appearance and allowed origins live on the widget page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {state.status === 'error' && state.error && !state.fieldErrors ? (
            <FormMessage tone="error">{state.error}</FormMessage>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Name" error={state.fieldErrors?.name}>
              {(control) => (
                <Input {...control} name="name" maxLength={NAME_MAX_LENGTH} defaultValue={value('name', assistant.name)} />
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
          <FormField label="Description" hint="A note for you. Visitors never see it." error={state.fieldErrors?.description}>
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
          <FormField
            label="Welcome message"
            hint="The first thing the widget says when it opens."
            error={state.fieldErrors?.welcomeMessage}
          >
            {(control) => (
              <Input
                {...control}
                name="welcomeMessage"
                maxLength={WELCOME_MAX_LENGTH}
                defaultValue={value('welcomeMessage', assistant.welcome_message)}
              />
            )}
          </FormField>
          <FormField
            label="Suggested questions"
            hint={`One per line, up to ${SUGGESTED_QUESTIONS_MAX}, each under ${SUGGESTED_QUESTION_MAX_LENGTH} characters. Shown before the first message.`}
            error={state.fieldErrors?.suggestedQuestions}
          >
            {(control) => (
              <Textarea
                {...control}
                name="suggestedQuestions"
                rows={4}
                defaultValue={value('suggestedQuestions', assistant.suggested_questions.join('\n'))}
                placeholder={'How do I create an API key?\nWhat does the free plan include?'}
              />
            )}
          </FormField>
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
