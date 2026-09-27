'use server';

import { z } from 'zod';

import {
  MAX_PROJECT_INSTRUCTIONS,
  MAX_PROJECT_NAME,
  MAX_PROJECT_SOURCES,
  PROJECT_COLUMNS,
  projectFromRow,
  type ProjectRow,
} from '@/lib/chat/projects';
import { getSession } from '@/lib/session';

export type ProjectActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? unknown : { project: T }))
  | { ok: false; error: string };

/** Postgres unique_violation: a project with that name already exists on the assistant. */
const UNIQUE_VIOLATION = '23505';
/** Postgres foreign_key_violation: the project (or conversation) is gone. */
const FOREIGN_KEY_VIOLATION = '23503';

const nameSchema = z.string().trim().min(1).max(MAX_PROJECT_NAME);

const createSchema = z.object({
  id: z.uuid(),
  assistantId: z.uuid(),
  name: nameSchema,
});

const updateSchema = z.object({
  id: z.uuid(),
  name: nameSchema.optional(),
  instructions: z.string().max(MAX_PROJECT_INSTRUCTIONS).optional(),
  sourceIds: z.array(z.uuid()).max(MAX_PROJECT_SOURCES).optional(),
});

const idSchema = z.object({ id: z.uuid() });

const moveSchema = z.object({
  conversationId: z.uuid(),
  projectId: z.uuid().nullable(),
});

const NAME_RULE = `A project name needs 1 to ${MAX_PROJECT_NAME} characters.`;

const duplicateName = (name: string) =>
  `There is already a project called “${name}”. Pick another name.`;

/**
 * Projects are written through the visitor's own client, so row level security decides what they
 * may touch: their own projects, on their own assistant, with their own assistant's files. None
 * of these revalidates a chat path; the caller has already updated its cache.
 */
export const createProject = async (input: {
  id: string;
  assistantId: string;
  name: string;
}): Promise<ProjectActionResult<ProjectRow>> => {
  const parsed = createSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: NAME_RULE };
  }

  const { supabase, user } = await getSession();

  if (!user) {
    return { ok: false, error: 'Sign in to create a project.' };
  }

  const { data, error } = await supabase
    .from('chat_projects')
    .insert({
      id: parsed.data.id,
      assistant_id: parsed.data.assistantId,
      owner_id: user.id,
      name: parsed.data.name,
    })
    .select(PROJECT_COLUMNS)
    .single();

  if (error?.code === UNIQUE_VIOLATION) {
    return { ok: false, error: duplicateName(parsed.data.name) };
  }

  if (error || !data) {
    return { ok: false, error: 'The project could not be created. Try again.' };
  }

  return { ok: true, project: projectFromRow(data) };
};

/**
 * Renames a project, changes its instructions, or replaces its files with `sourceIds` in that
 * order. Files that are not the assistant's own (deleted meanwhile, or never were) are left out.
 */
export const updateProject = async (input: {
  id: string;
  name?: string;
  instructions?: string;
  sourceIds?: string[];
}): Promise<ProjectActionResult<ProjectRow>> => {
  const parsed = updateSchema.safeParse(input);

  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')));

    return {
      ok: false,
      error: fields.has('instructions')
        ? `Keep the instructions under ${MAX_PROJECT_INSTRUCTIONS.toLocaleString('en-US')} characters.`
        : fields.has('sourceIds')
          ? `A project holds up to ${MAX_PROJECT_SOURCES} files.`
          : fields.has('name')
            ? NAME_RULE
            : 'That project id is not valid.',
    };
  }

  const { supabase, user } = await getSession();

  if (!user) {
    return { ok: false, error: 'Sign in to change a project.' };
  }

  const { id, name, instructions, sourceIds } = parsed.data;

  // Always written, even when only the files change: the row's new updated_at is how another
  // tab learns that the project changed.
  const { data: updated, error } = await supabase
    .from('chat_projects')
    .update({
      ...(name !== undefined ? { name } : {}),
      ...(instructions !== undefined ? { instructions: instructions.trim() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, assistant_id')
    .maybeSingle();

  if (error?.code === UNIQUE_VIOLATION && name) {
    return { ok: false, error: duplicateName(name) };
  }

  if (error) {
    return { ok: false, error: 'The project could not be saved. Try again.' };
  }

  if (!updated) {
    return { ok: false, error: 'That project no longer exists.' };
  }

  if (sourceIds) {
    const problem = await replaceFiles(supabase, {
      projectId: id,
      assistantId: updated.assistant_id,
      ownerId: user.id,
      sourceIds: [...new Set(sourceIds)],
    });

    if (problem) {
      return { ok: false, error: problem };
    }
  }

  const { data: row, error: readError } = await supabase
    .from('chat_projects')
    .select(PROJECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (readError || !row) {
    return { ok: false, error: 'The project was saved but could not be read back. Reload the page.' };
  }

  return { ok: true, project: projectFromRow(row) };
};

type SessionClient = Awaited<ReturnType<typeof getSession>>['supabase'];

/** Makes `sourceIds` the project's files, in that order, and nothing else. Returns a problem or null. */
const replaceFiles = async (
  supabase: SessionClient,
  target: { projectId: string; assistantId: string; ownerId: string; sourceIds: string[] },
) => {
  const { data: sources, error: sourcesError } = target.sourceIds.length
    ? await supabase
        .from('sources')
        .select('id')
        .eq('assistant_id', target.assistantId)
        .in('id', target.sourceIds)
    : { data: [], error: null };

  if (sourcesError) {
    return 'The project’s files could not be saved. Try again.';
  }

  const known = new Set((sources ?? []).map((source) => source.id));
  const ids = target.sourceIds.filter((id) => known.has(id));

  let removal = supabase.from('project_sources').delete().eq('project_id', target.projectId);

  if (ids.length > 0) {
    removal = removal.not('source_id', 'in', `(${ids.join(',')})`);
  }

  // The two touch different rows, so they run side by side.
  const [removed, added] = await Promise.all([
    removal,
    ids.length > 0
      ? supabase.from('project_sources').upsert(
          ids.map((sourceId, position) => ({
            project_id: target.projectId,
            source_id: sourceId,
            owner_id: target.ownerId,
            position,
          })),
          { onConflict: 'project_id,source_id' },
        )
      : Promise.resolve({ error: null }),
  ]);

  return removed.error || added.error ? 'The project’s files could not be saved. Try again.' : null;
};

/** Deletes a project. Its conversations stay, outside any project; its files stay in Knowledge. */
export const deleteProject = async (input: { id: string }): Promise<ProjectActionResult> => {
  const parsed = idSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: 'That project id is not valid.' };
  }

  const { supabase, user } = await getSession();

  if (!user) {
    return { ok: false, error: 'Sign in to delete a project.' };
  }

  const { error } = await supabase.from('chat_projects').delete().eq('id', parsed.data.id);

  if (error) {
    return { ok: false, error: 'The project could not be deleted. Try again.' };
  }

  return { ok: true };
};

/** Moves a conversation into a project, or out of any with null. */
export const moveConversation = async (input: {
  conversationId: string;
  projectId: string | null;
}): Promise<ProjectActionResult> => {
  const parsed = moveSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: 'That conversation or project id is not valid.' };
  }

  const { supabase, user } = await getSession();

  if (!user) {
    return { ok: false, error: 'Sign in to move a conversation.' };
  }

  const { data, error } = await supabase
    .from('conversations')
    .update({ project_id: parsed.data.projectId })
    .eq('id', parsed.data.conversationId)
    .eq('channel', 'app')
    .select('id');

  if (error?.code === FOREIGN_KEY_VIOLATION) {
    return { ok: false, error: 'That project no longer exists. Pick another one.' };
  }

  if (error) {
    return { ok: false, error: 'The conversation could not be moved. Try again.' };
  }

  if (!data || data.length === 0) {
    return { ok: false, error: 'That conversation no longer exists.' };
  }

  return { ok: true };
};
