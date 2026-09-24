'use server';

import { z } from 'zod';

import { getSession } from '@/lib/session';

const deleteSchema = z.object({
  assistantId: z.uuid(),
  conversationId: z.uuid(),
});

export type DeleteConversationState = { error?: string; deleted?: boolean };

/**
 * Removes a conversation and, through the cascade, its messages. Runs as the visitor so row
 * level security keeps it to their own rows; the assistant id is checked too so a stale form
 * cannot delete across assistants. The caller navigates on success, after it has dropped the
 * inbox lists it holds in cache.
 */
export const deleteConversation = async (
  _state: DeleteConversationState,
  formData: FormData,
): Promise<DeleteConversationState> => {
  const parsed = deleteSchema.safeParse({
    assistantId: formData.get('assistantId'),
    conversationId: formData.get('conversationId'),
  });

  if (!parsed.success) {
    return { error: 'This conversation cannot be identified. Reload the page and try again.' };
  }

  const { supabase, user } = await getSession();

  if (!user) {
    return { error: 'Your session has expired. Sign in again to delete conversations.' };
  }

  const { data, error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', parsed.data.conversationId)
    .eq('assistant_id', parsed.data.assistantId)
    .select('id');

  if (error) {
    console.error('deleteConversation', error);

    return { error: 'The conversation could not be deleted because the database refused the change. Try again.' };
  }

  if (!data || data.length === 0) {
    return { error: 'That conversation no longer exists.' };
  }

  return { deleted: true };
};
