import type { SupabaseClient, User } from '@supabase/supabase-js';
import { after } from 'next/server';

import { getAccountPlan, getAccountUsage } from '@/lib/account';
import { getAiProvider } from '@/lib/ai';
import type { Database, Source } from '@/lib/db';
import { checkCapacity } from '@/lib/plans';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { MAX_UPLOAD_BYTES, storagePathFor, UPLOAD_TYPES, UPLOAD_TYPES_LABEL, uploadTypeFor } from '@/lib/uploads';

import { ingestSource, PAGE_LIMIT_MESSAGE, STALE_RUN_MS, STORAGE_BUCKET } from './index';
import { labelForUrl } from './label';
import { firstIssue, formFields, type SourceInput, uploadFieldsSchema } from './schema';

export type UserClient = SupabaseClient<Database>;

export { labelForUrl } from './label';

/** An error the caller can show as it is, with the HTTP status that fits it. */
export class SourceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SourceError';
    this.status = status;
  }
}

export type { SourceInput } from './schema';
export { firstIssue, MAX_TEXT_CHARS, sourceInputSchema } from './schema';

export type UploadInput = { kind: 'upload'; assistantId: string; id?: string; title?: string; file: File };

export type CreateSourceInput = SourceInput | UploadInput;

/** Reads the multipart body of an upload. Throws a SourceError the route can return directly. */
export const parseUploadForm = (form: FormData): UploadInput => {
  const fields = uploadFieldsSchema.safeParse(formFields(form, ['assistantId', 'id', 'title']));

  if (!fields.success) {
    throw new SourceError(400, firstIssue(fields.error));
  }

  const file = form.get('file');

  if (!(file instanceof File) || file.size === 0) {
    throw new SourceError(400, 'Choose a file to upload.');
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new SourceError(400, 'That file is larger than 25 MB. Split it or pick a smaller one.');
  }

  if (!uploadTypeFor(file.name, file.type)) {
    throw new SourceError(400, `That file type is not supported. Upload ${UPLOAD_TYPES_LABEL}.`);
  }

  return { kind: 'upload', assistantId: fields.data.assistantId, id: fields.data.id, title: fields.data.title, file };
};

const assertOwnsAssistant = async (supabase: UserClient, id: string) => {
  const { data, error } = await supabase.from('assistants').select('id').eq('id', id).maybeSingle();

  if (error) {
    console.error('[sources] assistant lookup failed', error);
    throw new SourceError(500, 'The assistant could not be checked. Try again in a moment.');
  }

  if (!data) {
    throw new SourceError(404, 'That assistant does not exist.');
  }
};

const assertPagesRemain = async () => {
  const [{ plan }, usage] = await Promise.all([getAccountPlan(), getAccountUsage()]);

  if (!checkCapacity(plan.id, usage.pages, 'pages').allowed) {
    throw new SourceError(403, PAGE_LIMIT_MESSAGE);
  }
};

const insertSource = async (
  supabase: UserClient,
  row: Database['public']['Tables']['sources']['Insert'],
): Promise<Source> => {
  const { data, error } = await supabase.from('sources').insert(row).select('*').single();

  if (error?.code === '23505') {
    throw new SourceError(409, 'That source was already added. Refresh the page to see it.');
  }

  if (error || !data) {
    console.error('[sources] insert failed', error);
    throw new SourceError(500, 'The source could not be saved. Try again in a moment.');
  }

  return data;
};

/**
 * Storage trusts the Blob's own type over the contentType option, and browsers report an empty or
 * generic type for Markdown and Word files, so the bytes are re-wrapped with the type we resolved.
 */
const storeObject = async (supabase: UserClient, path: string, body: Blob, contentType: string) => {
  const typed = body.type === contentType ? body : new Blob([await body.arrayBuffer()], { type: contentType });
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, typed, { contentType, upsert: false });

  if (error) {
    throw new SourceError(500, 'The file could not be stored. Try the upload again.');
  }
};

/**
 * Creates a source for an assistant the signed-in user owns: uploads go to the bucket first, then
 * the row is inserted as the user so row level security holds. Ingestion is scheduled separately.
 */
export const createSource = async ({
  supabase,
  user,
  input,
}: {
  supabase: UserClient;
  user: Pick<User, 'id'>;
  input: CreateSourceInput;
}): Promise<Source> => {
  await assertOwnsAssistant(supabase, input.assistantId);
  await assertPagesRemain();

  const base = {
    assistant_id: input.assistantId,
    owner_id: user.id,
    status: 'queued' as const,
    ...(input.id ? { id: input.id } : {}),
  };

  switch (input.kind) {
    case 'url':
    case 'sitemap':
      return insertSource(supabase, {
        ...base,
        kind: input.kind,
        uri: input.url,
        title: input.title ?? labelForUrl(input.url, input.kind),
      });
    case 'text': {
      const path = storagePathFor(user.id, input.assistantId, 'md');
      const body = new Blob([input.text], { type: UPLOAD_TYPES.md.mime });

      await storeObject(supabase, path, body, UPLOAD_TYPES.md.mime);

      try {
        return await insertSource(supabase, {
          ...base,
          kind: 'text',
          title: input.title,
          storage_path: path,
          mime_type: UPLOAD_TYPES.md.mime,
          byte_size: body.size,
        });
      } catch (cause) {
        await supabase.storage.from(STORAGE_BUCKET).remove([path]);
        throw cause;
      }
    }
    case 'upload': {
      const type = uploadTypeFor(input.file.name, input.file.type);

      if (!type) {
        throw new SourceError(400, `That file type is not supported. Upload ${UPLOAD_TYPES_LABEL}.`);
      }

      const spec = UPLOAD_TYPES[type];
      const path = storagePathFor(user.id, input.assistantId, spec.extensions[0]!);

      await storeObject(supabase, path, input.file, spec.mime);

      try {
        return await insertSource(supabase, {
          ...base,
          kind: 'upload',
          title: input.title ?? input.file.name.slice(0, 200),
          storage_path: path,
          mime_type: spec.mime,
          byte_size: input.file.size,
        });
      } catch (cause) {
        await supabase.storage.from(STORAGE_BUCKET).remove([path]);
        throw cause;
      }
    }
  }
};

/** Removes the row as the user; the stored file goes only once that succeeded. */
export const deleteSource = async ({ supabase, sourceId }: { supabase: UserClient; sourceId: string }) => {
  const { data, error } = await supabase.from('sources').delete().eq('id', sourceId).select('id, storage_path').maybeSingle();

  if (error) {
    console.error('[sources] delete failed', error);
    throw new SourceError(500, 'The source could not be deleted. Try again in a moment.');
  }

  if (!data) {
    throw new SourceError(404, 'That source does not exist.');
  }

  if (data.storage_path) {
    await supabase.storage.from(STORAGE_BUCKET).remove([data.storage_path]);
  }
};

/**
 * Puts a source back in the queue. The update is conditional, so two requests that arrive together
 * (two tabs, a double click, the API) queue it once: the second finds it taken and gets a 409. A
 * run that has not moved for a while is treated as dead and may be started over.
 */
export const requestReindex = async ({ supabase, sourceId }: { supabase: UserClient; sourceId: string }): Promise<Source> => {
  const staleBefore = new Date(Date.now() - STALE_RUN_MS).toISOString();
  const { data, error } = await supabase
    .from('sources')
    .update({ status: 'queued', error: null, pages_found: 0, pages_done: 0 })
    .eq('id', sourceId)
    .or(`status.in.(ready,failed),updated_at.lt.${staleBefore}`)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[sources] re-index request failed', error);
    throw new SourceError(500, 'The source could not be queued. Try again in a moment.');
  }

  if (data) {
    return data;
  }

  const { data: current } = await supabase.from('sources').select('id').eq('id', sourceId).maybeSingle();

  if (!current) {
    throw new SourceError(404, 'That source does not exist.');
  }

  throw new SourceError(409, 'This source is being indexed right now. Wait for it to finish.');
};

/** Runs ingestion once the response has gone out, with the service role and the configured model. */
export const scheduleIngestion = (sourceId: string) => {
  after(async () => {
    await ingestSource({ service: createSupabaseServiceClient(), provider: getAiProvider(), sourceId });
  });
};

export const sourceErrorResponse = (cause: unknown) => {
  if (cause instanceof SourceError) {
    return Response.json({ error: cause.message }, { status: cause.status });
  }

  return Response.json(
    { error: cause instanceof Error && cause.message ? cause.message : 'Something went wrong. Try again.' },
    { status: 500 },
  );
};
