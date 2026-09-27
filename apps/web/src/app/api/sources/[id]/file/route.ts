import { z } from 'zod';

import { getSession } from '@/lib/session';
import {
  contentDisposition,
  fileNameFor,
  STORAGE_BUCKET,
  type UploadType,
  uploadTypeFor,
} from '@/lib/uploads';

export const dynamic = 'force-dynamic';

/** Long enough for the browser to follow the redirect, too short to be worth sharing. */
const SIGNED_URL_SECONDS = 60;

/**
 * Markdown and plain text are served from here as text/plain: Storage labels Markdown
 * text/markdown, which Firefox and Safari download instead of showing. Past this size a text file
 * goes the way of every other file, straight from Storage.
 */
const INLINE_TEXT_BYTES = 5 * 1024 * 1024;

const NO_STORE = { 'cache-control': 'private, no-store' } as const;

const fail = (status: number, error: string) =>
  Response.json({ error }, { status, headers: NO_STORE });

const MISSING_FILE = 'The stored file is missing. Delete this source and upload it again.';

const servedAsText = (type: UploadType | null) => type === 'md' || type === 'txt';

/**
 * Opens a source's original file for its owner: an uploaded document, or the Markdown a pasted
 * text was stored as. The row is read with the caller's session, so row level security decides
 * who may open what, and the file is signed with the same session, so the storage policies check
 * again. PDF, HTML and large text files redirect to a signed Storage URL that opens in the browser
 * (Storage serves HTML as plain text, so it cannot run); Word files download; Markdown and plain
 * text are sent from here as text the browser shows.
 */
export async function GET(_request: Request, context: RouteContext<'/api/sources/[id]/file'>) {
  const { supabase, user } = await getSession();

  if (!user) {
    return fail(401, 'Sign in to open this file.');
  }

  const { id } = await context.params;

  if (!z.uuid().safeParse(id).success) {
    return fail(404, 'That file does not exist.');
  }

  const { data: source, error } = await supabase
    .from('sources')
    .select('id, kind, title, storage_path, mime_type, byte_size')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[sources] file lookup failed', error);

    return fail(500, 'The file could not be opened. Try again in a moment.');
  }

  if (!source) {
    return fail(404, 'That file does not exist.');
  }

  if (!source.storage_path) {
    return fail(404, 'This source is a website, so it has no stored file. Open its pages instead.');
  }

  const bucket = supabase.storage.from(STORAGE_BUCKET);
  const type = uploadTypeFor(source.storage_path, source.mime_type);
  const name = fileNameFor(source.title, type);

  if (servedAsText(type) && (source.byte_size ?? 0) <= INLINE_TEXT_BYTES) {
    const { data: file, error: downloadError } = await bucket.download(source.storage_path);

    if (downloadError || !file) {
      return fail(404, MISSING_FILE);
    }

    return new Response(file, {
      headers: {
        ...NO_STORE,
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': contentDisposition('inline', name),
        'x-content-type-options': 'nosniff',
        // Shown as text whatever it contains; nothing in it may load or run.
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  }

  const { data: signed, error: signError } = await bucket.createSignedUrl(
    source.storage_path,
    SIGNED_URL_SECONDS,
    type === 'docx' ? { download: name } : undefined,
  );

  if (signError || !signed) {
    return fail(404, MISSING_FILE);
  }

  return new Response(null, {
    status: 302,
    headers: { ...NO_STORE, location: signed.signedUrl },
  });
}
