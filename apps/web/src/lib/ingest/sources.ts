import type { SupabaseClient, User } from '@supabase/supabase-js';
import { after } from 'next/server';
import { z } from 'zod';

import { getAccountPlan, getAccountUsage } from '@/lib/account';
import { getAiProvider } from '@/lib/ai';
import type { Database, Source } from '@/lib/db';
import { checkCapacity } from '@/lib/plans';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { MAX_UPLOAD_BYTES, storagePathFor, UPLOAD_TYPES, UPLOAD_TYPES_LABEL, uploadTypeFor } from '@/lib/uploads';

import { ingestSource, PAGE_LIMIT_MESSAGE, STORAGE_BUCKET } from './index';

export type UserClient = SupabaseClient<Database>;

/** Pasted text larger than this is really a file; the upload path handles those. */
export const MAX_TEXT_CHARS = 500_000;
/** A run that has not touched its row for this long is treated as dead and may be restarted. */
export const STALE_RUN_MS = 10 * 60_000;

/** An error the caller can show as it is, with the HTTP status that fits it. */
export class SourceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SourceError';
    this.status = status;
  }
}

const title = z.string().trim().min(1, 'Give the source a title.').max(200, 'Keep the title under 200 characters.');
const optionalTitle = z
  .string()
  .trim()
  .max(200, 'Keep the title under 200 characters.')
  .optional()
  .transform((value) => value || undefined);
const httpUrl = z
  .string({ error: 'Enter a web address.' })
  .trim()
  .min(1, 'Enter a web address.')
  .refine((value) => {
    try {
      const url = new URL(value);

      return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
    } catch {
      return false;
    }
  }, 'Enter a full address that starts with http:// or https://.');
const assistantId = z.uuid({ error: 'Pick an assistant.' });

export const sourceInputSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('url'), assistantId, url: httpUrl, title: optionalTitle }),
    z.object({ kind: z.literal('sitemap'), assistantId, url: httpUrl, title: optionalTitle }),
    z.object({
      kind: z.literal('text'),
      assistantId,
      title,
      text: z
        .string({ error: 'Paste some text.' })
        .trim()
        .min(1, 'Paste some text.')
        .max(MAX_TEXT_CHARS, 'That is more than 500,000 characters. Upload it as a file instead.'),
    }),
  ],
  { error: 'Choose a website, sitemap, upload or pasted text.' },
);

export type SourceInput = z.infer<typeof sourceInputSchema>;

export type UploadInput = { kind: 'upload'; assistantId: string; title?: string; file: File };

export type CreateSourceInput = SourceInput | UploadInput;

/** The first problem zod found, phrased for people. */
export const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? 'Check the form and try again.';

/** Reads the multipart body of an upload. Throws a SourceError the route can return directly. */
export const parseUploadForm = (form: FormData): UploadInput => {
  const fields = z
    .object({ assistantId, title: optionalTitle })
    .safeParse({ assistantId: form.get('assistantId'), title: form.get('title') ?? undefined });

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

  return { kind: 'upload', assistantId: fields.data.assistantId, title: fields.data.title, file };
};

/** "docs.example.com/guide" for a URL: what people recognise a website source by. */
export const labelForUrl = (value: string) => {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, '');

    return `${url.host}${path}`.slice(0, 200);
  } catch {
    return value.slice(0, 200);
  }
};

const assertOwnsAssistant = async (supabase: UserClient, id: string) => {
  const { data, error } = await supabase.from('assistants').select('id').eq('id', id).maybeSingle();

  if (error) {
    throw new SourceError(500, `The assistant could not be checked (${error.message}).`);
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

  if (error || !data) {
    throw new SourceError(500, `The source could not be saved (${error?.message ?? 'no row returned'}).`);
  }

  return data;
};

const storeObject = async (supabase: UserClient, path: string, body: Blob, contentType: string) => {
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, body, { contentType, upsert: false });

  if (error) {
    throw new SourceError(500, `The file could not be stored (${error.message}).`);
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

  const base = { assistant_id: input.assistantId, owner_id: user.id, status: 'queued' as const };

  switch (input.kind) {
    case 'url':
    case 'sitemap':
      return insertSource(supabase, { ...base, kind: input.kind, uri: input.url, title: input.title ?? labelForUrl(input.url) });
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
    throw new SourceError(500, `The source could not be deleted (${error.message}).`);
  }

  if (!data) {
    throw new SourceError(404, 'That source does not exist.');
  }

  if (data.storage_path) {
    await supabase.storage.from(STORAGE_BUCKET).remove([data.storage_path]);
  }
};

/** Puts a source back in the queue. A run that is still moving is left alone. */
export const requestReindex = async ({ supabase, sourceId }: { supabase: UserClient; sourceId: string }): Promise<Source> => {
  const { data: current, error } = await supabase
    .from('sources')
    .select('status, updated_at')
    .eq('id', sourceId)
    .maybeSingle();

  if (error) {
    throw new SourceError(500, `The source could not be loaded (${error.message}).`);
  }

  if (!current) {
    throw new SourceError(404, 'That source does not exist.');
  }

  const active = current.status === 'crawling' || current.status === 'indexing';

  if (active && Date.now() - new Date(current.updated_at).getTime() < STALE_RUN_MS) {
    throw new SourceError(409, 'This source is being indexed right now. Wait for it to finish.');
  }

  const { data, error: updateError } = await supabase
    .from('sources')
    .update({ status: 'queued', error: null, pages_found: 0, pages_done: 0 })
    .eq('id', sourceId)
    .select('*')
    .single();

  if (updateError || !data) {
    throw new SourceError(500, `The source could not be queued (${updateError?.message ?? 'no row returned'}).`);
  }

  return data;
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
