'use server';

import { z } from 'zod';

import type { Source } from '@/lib/db';
import {
  createSource,
  deleteSource as removeSource,
  firstIssue,
  requestReindex,
  scheduleIngestion,
  SourceError,
  sourceInputSchema,
} from '@/lib/ingest/sources';
import { getSession } from '@/lib/session';

export type AddSourceState = { error?: string; source?: Source; submittedAt?: number };
export type SourceActionResult = { error?: string; source?: Source };

const messageOf = (cause: unknown) =>
  cause instanceof SourceError || (cause instanceof Error && cause.message)
    ? (cause as Error).message
    : 'Something went wrong. Try again.';

const field = (form: FormData, name: string) => {
  const value = form.get(name);

  return typeof value === 'string' ? value : undefined;
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
export const addSource = async (_previous: AddSourceState, form: FormData): Promise<AddSourceState> => {
  const { supabase, user } = await getSession();

  if (!user) {
    return { error: 'Sign in to add a source.' };
  }

  const parsed = sourceInputSchema.safeParse({
    kind: field(form, 'kind'),
    assistantId: field(form, 'assistantId'),
    id: field(form, 'id'),
    url: field(form, 'url'),
    title: field(form, 'title'),
    text: field(form, 'text'),
  });

  if (!parsed.success) {
    return { error: firstIssue(parsed.error), submittedAt: Date.now() };
  }

  try {
    const source = await createSource({ supabase, user, input: parsed.data });

    scheduleIngestion(source.id);

    return { source, submittedAt: Date.now() };
  } catch (cause) {
    return { error: messageOf(cause), submittedAt: Date.now() };
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
