'use server';

import { z } from 'zod';

import { LEAD_STATUSES, type LeadStatus } from '@/lib/analytics';
import { getSession } from '@/lib/session';

const updateSchema = z.object({
  leadId: z.uuid(),
  status: z.enum(LEAD_STATUSES),
});

export type LeadActionResult = { ok: true; status: LeadStatus } | { ok: false; error: string };

/**
 * Moves a lead between new, contacted and closed. Runs as the signed-in visitor, so row level
 * security decides whether the lead is theirs; a foreign or missing id simply updates nothing.
 */
export const updateLeadStatus = async (input: unknown): Promise<LeadActionResult> => {
  const parsed = updateSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: 'That status is not one of new, contacted or closed.' };
  }

  const { supabase, user } = await getSession();

  if (!user) {
    return { ok: false, error: 'Your session has expired. Sign in again to change leads.' };
  }

  const { data, error } = await supabase
    .from('leads')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.leadId)
    .select('id, status')
    .maybeSingle();

  if (error) {
    console.error('updateLeadStatus', error);

    return { ok: false, error: 'The lead could not be saved because the database refused the change. Try again.' };
  }

  if (!data) {
    return { ok: false, error: 'That lead no longer exists.' };
  }

  return { ok: true, status: data.status };
};
