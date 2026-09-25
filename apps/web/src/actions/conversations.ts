'use server';

import { z } from 'zod';

import { MAX_TITLE_LENGTH } from '@/lib/chat/conversations';
import { getSession } from '@/lib/session';

export type ConversationActionResult = { ok: true } | { ok: false; error: string };

const renameSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
});

const deleteSchema = z.object({ id: z.uuid() });

/**
 * Both actions go through the visitor's own client, so row level security decides what they
 * may touch. They never revalidate a chat path: the caller has already updated the cache.
 */
export const renameConversation = async (input: {
  id: string;
  title: string;
}): Promise<ConversationActionResult> => {
  const parsed = renameSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: `A title needs 1 to ${MAX_TITLE_LENGTH} characters.` };
  }

  const { supabase, user } = await getSession();

  if (!user) {
    return { ok: false, error: 'Sign in to rename a conversation.' };
  }

  const { data, error } = await supabase
    .from('conversations')
    .update({ title: parsed.data.title })
    .eq('id', parsed.data.id)
    .select('id');

  if (error) {
    return { ok: false, error: 'The conversation could not be renamed. Try again.' };
  }

  if (!data || data.length === 0) {
    return { ok: false, error: 'That conversation no longer exists.' };
  }

  return { ok: true };
};

export const deleteConversation = async (input: {
  id: string;
}): Promise<ConversationActionResult> => {
  const parsed = deleteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: 'That conversation id is not valid.' };
  }

  const { supabase, user } = await getSession();

  if (!user) {
    return { ok: false, error: 'Sign in to delete a conversation.' };
  }

  const { error } = await supabase.from('conversations').delete().eq('id', parsed.data.id);

  if (error) {
    return { ok: false, error: 'The conversation could not be deleted. Try again.' };
  }

  return { ok: true };
};
