import { cache } from 'react';

import type { Assistant } from '@/lib/db';
import { getSession } from '@/lib/session';

export type AssistantSummary = Pick<Assistant, 'id' | 'name' | 'slug'>;

/** The signed-in visitor's assistants, oldest first. Resolved once per request. */
export const listAssistants = cache(async (): Promise<AssistantSummary[]> => {
  const { supabase, user } = await getSession();

  if (!user) {
    return [];
  }

  const { data } = await supabase
    .from('assistants')
    .select('id, name, slug')
    .order('created_at', { ascending: true });

  return data ?? [];
});

/** One assistant the visitor owns, or null. Row level security does the ownership check. */
export const getAssistant = cache(async (assistantId: string): Promise<Assistant | null> => {
  const { supabase, user } = await getSession();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from('assistants')
    .select('*')
    .eq('id', assistantId)
    .maybeSingle();

  return data ?? null;
});
