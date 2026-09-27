import 'server-only';

import { UUID_PATTERN } from '@parbot/shared';
import { cache } from 'react';

import { requireUser } from '@/lib/session';

/**
 * Reads for the document viewer and the source page, with the reader's own session: row level
 * security keeps every account to its own pages. Cached per request, so the page and its metadata
 * share one round trip.
 */

export const VIEWER_SOURCE_COLUMNS =
  'id, kind, title, uri, storage_path, mime_type, byte_size, document_count, status, error';

export const loadDocument = cache(async (assistantId: string, documentId: string) => {
  if (!UUID_PATTERN.test(documentId)) {
    return null;
  }

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('documents')
    .select(`id, title, url, content, updated_at, source:sources(${VIEWER_SOURCE_COLUMNS})`)
    .eq('id', documentId)
    .eq('assistant_id', assistantId)
    .maybeSingle();

  if (error) {
    throw new Error('The page could not be loaded. Reload to try again.');
  }

  return data?.source ? { ...data, source: data.source } : null;
});

/** A cited passage's text, when it is still part of the page it was cited from. */
export const loadPassage = async (documentId: string, chunkId: string) => {
  if (!UUID_PATTERN.test(chunkId)) {
    return null;
  }

  const { supabase } = await requireUser();
  const { data } = await supabase
    .from('chunks')
    .select('content')
    .eq('id', chunkId)
    .eq('document_id', documentId)
    .maybeSingle();

  return data?.content ?? null;
};

export const loadSource = cache(async (assistantId: string, sourceId: string) => {
  if (!UUID_PATTERN.test(sourceId)) {
    return null;
  }

  const { supabase } = await requireUser();
  const [source, first] = await Promise.all([
    supabase
      .from('sources')
      .select(VIEWER_SOURCE_COLUMNS)
      .eq('id', sourceId)
      .eq('assistant_id', assistantId)
      .maybeSingle(),
    // A file or a note has one page; its text is all the source page needs.
    supabase
      .from('documents')
      .select('id, title, url, content, updated_at', { count: 'exact' })
      .eq('source_id', sourceId)
      .eq('assistant_id', assistantId)
      .order('created_at', { ascending: true })
      .limit(1),
  ]);

  if (source.error || first.error) {
    throw new Error('The source could not be loaded. Reload to try again.');
  }

  if (!source.data) {
    return null;
  }

  return {
    source: source.data,
    pageCount: first.count ?? first.data.length,
    firstPage: first.data[0] ?? null,
  };
});

/** Every page a website or sitemap contributed, by title. */
export const loadSourcePages = async (assistantId: string, sourceId: string) => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, url')
    .eq('source_id', sourceId)
    .eq('assistant_id', assistantId)
    .order('title', { ascending: true })
    .limit(1000);

  if (error) {
    throw new Error('The pages could not be loaded. Reload to try again.');
  }

  return data;
};
