'use server';

import { z } from 'zod';

import type { Source } from '@/lib/db';
import { firstIssue, formFields, sourceInputSchema } from '@/lib/ingest/schema';
import {
  createSource,
  deleteSource as removeSource,
  requestReindex,
  scheduleIngestion,
  SourceError,
} from '@/lib/ingest/sources';
import { getSession } from '@/lib/session';

export type AddSourceState = { error?: string; source?: Source };
export type SourceActionResult = { error?: string; source?: Source };

/** Our own errors are written for people; anything else is reported in our words, not its own. */
const messageOf = (cause: unknown) => {
  if (cause instanceof SourceError) {
    return cause.message;
  }

  console.error('[sources] unexpected failure', cause);

  return 'Something went wrong on our side. Try again in a moment.';
};

const sourceIdSchema = z.uuid();

/** A malformed id never reaches the database; it reads as a source that is not there. */
const parseSourceId = (sourceId: string) => {
  const parsed = sourceIdSchema.safeParse(sourceId);

  return parsed.success ? parsed.data : null;
};

/**
 * The Add source dialog's website, sitemap and pasted-text forms. Uploads post to the API route
 * instead: server actions cap their body at a size a document easily exceeds.
 */
export const addSource = async (
  _previous: AddSourceState,
  form: FormData,
): Promise<AddSourceState> => {
  const { supabase, user } = await getSession();

  if (!user) {
    return { error: 'Sign in to add a source.' };
  }

  const parsed = sourceInputSchema.safeParse(
    formFields(form, ['kind', 'assistantId', 'id', 'url', 'title', 'text']),
  );

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  try {
    const source = await createSource({ supabase, user, input: parsed.data });

    scheduleIngestion(source.id);

    return { source };
  } catch (cause) {
    return { error: messageOf(cause) };
  }
};

export const reindexSource = async (sourceId: string): Promise<SourceActionResult> => {
  const { supabase, user } = await getSession();

  if (!user) {
    return { error: 'Sign in to re-index a source.' };
  }

  const id = parseSourceId(sourceId);

  if (!id) {
    return { error: 'That source does not exist.' };
  }

  try {
    const source = await requestReindex({ supabase, sourceId: id });

    scheduleIngestion(source.id);

    return { source };
  } catch (cause) {
    return { error: messageOf(cause) };
  }
};

export const deleteSource = async (sourceId: string): Promise<SourceActionResult> => {
  const { supabase, user } = await getSession();

  if (!user) {
    return { error: 'Sign in to remove a source.' };
  }

  const id = parseSourceId(sourceId);

  if (!id) {
    return { error: 'That source does not exist.' };
  }

  try {
    await removeSource({ supabase, sourceId: id });

    return {};
  } catch (cause) {
    return { error: messageOf(cause) };
  }
};
