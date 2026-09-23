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
import { getAccountPlan, getAccountUsage } from '@/lib/account';
import { type FormState, formValues, parseForm } from '@/lib/form';
import { checkCapacity } from '@/lib/plans';
import { requireUser } from '@/lib/session';
import { slugify, uniqueSlug } from '@/lib/slug';

/** Postgres: a unique index rejected the row. */
const UNIQUE_VIOLATION = '23505';
const INSERT_ATTEMPTS = 3;

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
  const [account, usage] = await Promise.all([getAccountPlan(), getAccountUsage()]);
  const capacity = checkCapacity(account.plan.id, usage.assistants, 'assistants');

  if (!capacity.allowed) {
    return {
      status: 'error',
      values,
      error: `The ${account.plan.name} plan includes ${capacity.limit} ${capacity.limit === 1 ? 'assistant' : 'assistants'} and this account already has ${capacity.used}. Upgrade on the billing page to add another.`,
    };
  }

  const base = parsed.data.slug || slugify(parsed.data.name);
  const { data: existing } = await supabase.from('assistants').select('slug');
  const taken = new Set((existing ?? []).map((row) => row.slug));
  let slug = uniqueSlug(base, taken);
  let createdId: string | null = null;

  // Another tab may have taken the slug between the read and the insert; move on to the next suffix.
  for (let attempt = 0; attempt < INSERT_ATTEMPTS && !createdId; attempt += 1) {
    const { data, error } = await supabase
      .from('assistants')
      .insert({
        owner_id: user.id,
        name: parsed.data.name,
        slug,
        description: parsed.data.description || null,
      })
      .select('id')
      .single();

    if (data) {
      createdId = data.id;
      break;
    }

    if (error?.code !== UNIQUE_VIOLATION) {
      return { status: 'error', values, error: 'The assistant could not be created. Try again.' };
    }

    taken.add(slug);
    slug = uniqueSlug(base, taken);
  }

  if (!createdId) {
    return { status: 'error', values, error: 'That slug is taken. Choose another.' };
  }

  revalidatePath('/dashboard');
  revalidatePath('/onboarding');

  redirect(`/a/${createdId}/knowledge`);
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
  const { assistantId, name, slug, description, instructions, welcomeMessage, suggestedQuestions } = parsed.data;

  // Row level security limits the update to the visitor's own rows: a foreign id updates nothing.
  const { data, error } = await supabase
    .from('assistants')
    .update({
      name,
      slug,
      description: description || null,
      instructions: instructions || null,
      welcome_message: welcomeMessage,
      suggested_questions: suggestedQuestions,
    })
    .eq('id', assistantId)
    .select('id')
    .maybeSingle();

  if (error?.code === UNIQUE_VIOLATION) {
    return {
      status: 'error',
      values,
      error: 'Check the highlighted fields.',
      fieldErrors: { slug: 'Another of your assistants already uses this slug.' },
    };
  }

  if (error) {
    return { status: 'error', values, error: 'The settings could not be saved. Try again.' };
  }

  if (!data) {
    return { status: 'error', values, error: 'That assistant no longer exists.' };
  }

  revalidatePath(`/a/${assistantId}/settings`);
  revalidatePath('/dashboard');

  return {
    status: 'success',
    message: 'Settings saved.',
    values: { ...values, name, slug, description, instructions, welcomeMessage, suggestedQuestions: suggestedQuestions.join('\n') },
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

  const { supabase } = await requireUser();
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

  const { error } = await supabase.from('assistants').delete().eq('id', assistant.id);

  if (error) {
    return { status: 'error', values, error: 'The assistant could not be deleted. Try again.' };
  }

  revalidatePath('/dashboard');

  redirect('/dashboard');
};
