'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import { useActionState, useState } from 'react';

import { createAssistant } from '@/actions/assistants';
import { FormField, FormMessage } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { type FormState, idleState } from '@/lib/form';
import { slugify } from '@/lib/slug';

import { type CreateField, DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH, SLUG_HELP } from './schema';

/**
 * Name, a slug that follows the name until the visitor edits it, and an optional description.
 * The server derives the slug again when the field is left empty and suffixes it on a clash.
 */
export const CreateAssistantForm = () => {
  const [state, action, pending] = useActionState(createAssistant, idleState as FormState<CreateField>);
  const [name, setName] = useState(state.values?.name ?? '');
  const [slug, setSlug] = useState(state.values?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(state.values?.slug));

  const derivedSlug = name.trim() ? slugify(name) : '';
  const shownSlug = slugTouched ? slug : derivedSlug;

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.status === 'error' && state.error && !state.fieldErrors ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : null}
      <FormField
        label="Name"
        hint="Usually the product it answers for. Visitors see it in the widget."
        error={state.fieldErrors?.name}
      >
        {(control) => (
          <Input
            {...control}
            name="name"
            autoFocus
            maxLength={NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme Docs"
          />
        )}
      </FormField>
      <FormField label="Slug" hint={SLUG_HELP} error={state.fieldErrors?.slug}>
        {(control) => (
          <Input
            {...control}
            name="slug"
            className="font-mono"
            value={shownSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            placeholder="acme-docs"
            spellCheck={false}
          />
        )}
      </FormField>
      <FormField label="Description" hint="Optional. A note for you, not shown to visitors." error={state.fieldErrors?.description}>
        {(control) => (
          <Textarea
            {...control}
            name="description"
            maxLength={DESCRIPTION_MAX_LENGTH}
            defaultValue={state.values?.description ?? ''}
            placeholder="Answers questions about the Acme API and dashboard."
            rows={2}
          />
        )}
      </FormField>
      {/* What comes next is said once, in the onboarding header above the form. */}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Create assistant
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </form>
  );
};
