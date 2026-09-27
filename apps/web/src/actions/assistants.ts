'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  assistantIdSchema,
  CREATE_FIELDS,
  type CreateField,
  createAssistantSchema,
  DELETE_FIELDS,
  type DeleteField,
  deleteAssistantSchema,
  newPublicKey,
  UPDATE_FIELDS,
  type UpdateField,
  updateAssistantSchema,
} from '@/components/assistants/schema';
import { type FormState, formValues, parseForm } from '@/lib/form';
import { requireUser } from '@/lib/session';
import { slugify } from '@/lib/slug';
import { removeStoredFiles } from '@/lib/source-files';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

/** Postgres: a unique index rejected the row. */
const UNIQUE_VIOLATION = '23505';

type SessionClient = Awaited<ReturnType<typeof requireUser>>['supabase'];

/** The id of the account's assistant, if it has one. Row level security scopes the read. */
const accountAssistantId = async (supabase: SessionClient) => {
  const { data } = await supabase.from('assistants').select('id').limit(1).maybeSingle();

  return data?.id ?? null;
};

/**
 * Creates the account's one assistant. An account that already has it is sent there instead:
 * onboarding redirects such an account before showing the form, so this only happens from a
 * second tab or a form left open, and a unique index on owner_id settles two submits racing.
 */
export const createAssistant = async (
  _previous: FormState<CreateField>,
  formData: FormData,
): Promise<FormState<CreateField>> => {
  const values = formValues(formData, CREATE_FIELDS);
  const parsed = parseForm(createAssistantSchema, values);

  if (!parsed.ok) {
    return parsed.state;
  }

  const { supabase, user } = await requireUser();
  const existingId = await accountAssistantId(supabase);

  if (existingId) {
    // This tab's sidebar was drawn before the assistant existed.
    revalidatePath('/', 'layout');
    redirect(`/a/${existingId}`);
  }

  const { data, error } = await supabase
    .from('assistants')
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      slug: parsed.data.slug || slugify(parsed.data.name),
      description: parsed.data.description || null,
    })
    .select('id')
    .single();

  if (error?.code === UNIQUE_VIOLATION) {
    // Another tab created the account's assistant between the check above and this insert.
    const winnerId = await accountAssistantId(supabase);

    if (winnerId) {
      revalidatePath('/', 'layout');
      redirect(`/a/${winnerId}`);
    }

    return {
      status: 'error',
      values,
      error: 'This account already has an assistant. Reload the page to open it.',
    };
  }

  if (!data) {
    return { status: 'error', values, error: 'The assistant could not be created. Try again.' };
  }

  // The sidebar in the shared layout names the assistant, so every screen's layout is stale.
  revalidatePath('/', 'layout');

  redirect(`/a/${data.id}/knowledge`);
};

export const updateAssistant = async (
  _previous: FormState<UpdateField>,
  formData: FormData,
): Promise<FormState<UpdateField>> => {
  const values = formValues(formData, UPDATE_FIELDS);
  const parsed = parseForm(updateAssistantSchema, values);

  if (!parsed.ok) {
    return parsed.state;
  }

  const { supabase } = await requireUser();
  // The welcome message and suggested questions are saved from the Widget page only, next to the
  // preview readers see them in, so this action leaves both columns alone.
  const { assistantId, name, slug, description, instructions } = parsed.data;

  // Row level security limits the update to the visitor's own rows: a foreign id updates nothing.
  const { data, error } = await supabase
    .from('assistants')
    .update({
      name,
      slug,
      description: description || null,
      instructions: instructions || null,
    })
    .eq('id', assistantId)
    .select('id')
    .maybeSingle();

  if (error?.code === UNIQUE_VIOLATION) {
    return {
      status: 'error',
      values,
      error: 'Check the highlighted fields.',
      fieldErrors: { slug: 'This slug is already in use. Choose another.' },
    };
  }

  if (error) {
    return { status: 'error', values, error: 'The settings could not be saved. Try again.' };
  }

  if (!data) {
    return { status: 'error', values, error: 'That assistant no longer exists.' };
  }

  revalidatePath(`/a/${assistantId}/settings`);

  return {
    status: 'success',
    message: 'Settings saved.',
    values: { ...values, name, slug, description, instructions },
  };
};

export type RegenerateResult = { ok: true; publicKey: string } | { ok: false; error: string };

export const regeneratePublicKey = async (assistantId: string): Promise<RegenerateResult> => {
  const parsed = assistantIdSchema.safeParse(assistantId);

  if (!parsed.success) {
    return { ok: false, error: 'That assistant does not exist.' };
  }

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('assistants')
    .update({ public_key: newPublicKey() })
    .eq('id', parsed.data)
    .select('public_key')
    .maybeSingle();

  if (error) {
    return { ok: false, error: 'The key could not be regenerated. Try again.' };
  }

  if (!data) {
    return { ok: false, error: 'That assistant no longer exists.' };
  }

  revalidatePath(`/a/${parsed.data}/settings`);
  revalidatePath(`/a/${parsed.data}/widget`);

  return { ok: true, publicKey: data.public_key };
};

export const deleteAssistant = async (
  _previous: FormState<DeleteField>,
  formData: FormData,
): Promise<FormState<DeleteField>> => {
  const values = formValues(formData, DELETE_FIELDS);
  const parsed = parseForm(deleteAssistantSchema, values);

  if (!parsed.ok) {
    return parsed.state;
  }

  const { supabase, user } = await requireUser();
  // Row level security only shows the visitor's own rows, so a hit here proves ownership.
  const { data: assistant } = await supabase
    .from('assistants')
    .select('id, name')
    .eq('id', parsed.data.assistantId)
    .maybeSingle();

  if (!assistant) {
    return { status: 'error', values, error: 'That assistant no longer exists.' };
  }

  if (parsed.data.confirmName.trim() !== assistant.name) {
    return {
      status: 'error',
      values,
      error: 'The name did not match.',
      fieldErrors: { confirmName: `Type ${assistant.name} exactly as shown.` },
    };
  }

  // The row cascade reaches every table but not the bucket, so the uploaded and pasted files go
  // first. If that fails nothing has been deleted yet and a retry starts over with nothing orphaned.
  try {
    await removeStoredFiles(createSupabaseServiceClient(), `${user.id}/${assistant.id}`);
  } catch (cause) {
    console.error('[assistants] stored files were not removed', {
      assistantId: assistant.id,
      cause,
    });

    return {
      status: 'error',
      values,
      error: 'The assistant’s files could not be removed. Try again in a moment.',
    };
  }

  const { error } = await supabase.from('assistants').delete().eq('id', assistant.id);

  if (error) {
    return { status: 'error', values, error: 'The assistant could not be deleted. Try again.' };
  }

  // It was the account's only assistant: every screen's sidebar changes, and onboarding creates
  // the next one.
  revalidatePath('/', 'layout');

  redirect('/onboarding');
};
