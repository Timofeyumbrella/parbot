import { ExternalLink, Quote } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import type { Source } from '@/lib/db';
import { relativeTime } from '@/lib/format';
import {
  hasStoredFile,
  originalLabel,
  sourceFileHref,
  sourceHref,
} from '@/lib/knowledge/links';

import { renderDocument } from './document-markdown';
import { describeSource, SOURCE_KINDS } from './format';
import { PassageJump, ViewerBack } from './viewer-controls';

export type ViewerDocument = {
  id: string;
  title: string;
  url: string | null;
  content: string;
  updated_at: string;
};

export type ViewerSource = Pick<
  Source,
  'id' | 'kind' | 'title' | 'uri' | 'storage_path' | 'mime_type' | 'byte_size' | 'document_count'
>;

/** A passage asked for in the address: its text, or null when it is no longer indexed. */
export type ViewerPassage = { requested: boolean; content: string | null };

type DocumentViewerProps = {
  assistantId: string;
  document: ViewerDocument;
  source: ViewerSource;
  passage?: ViewerPassage;
};

/**
 * One indexed page, read in full: its title, where it came from, a way to the original, and the
 * text as the assistant reads it. Opened from a citation, the cited passage is highlighted and
 * brought into view; when the page changed since the answer, the viewer says so and opens at the
 * top rather than pointing at the wrong lines.
 */
export const DocumentViewer = ({ assistantId, document, source, passage }: DocumentViewerProps) => {
  const kind = SOURCE_KINDS[source.kind];
  const { body, matched } = renderDocument(document.content, {
    passage: passage?.content,
    baseUrl: document.url,
  });
  const original = hasStoredFile(source.kind)
    ? { href: sourceFileHref(source.id), label: originalLabel(source.kind) }
    : document.url
      ? { href: document.url, label: 'Open page' }
      : null;
  // A website's page names the site it belongs to; a file or a note is its own source.
  const partOfSite = source.document_count > 1 || !hasStoredFile(source.kind);

  return (
    <div className="flex flex-col gap-5" data-testid="document-viewer">
      <div className="flex flex-col gap-2">
        <ViewerBack fallback={`/a/${assistantId}/knowledge`} />
        <nav aria-label="Breadcrumb" className="text-muted-foreground min-w-0 text-xs">
          <ol className="flex min-w-0 items-center gap-1.5">
            <li className="shrink-0">
              <Link href={`/a/${assistantId}/knowledge`} className="hover:text-foreground">
                Knowledge
              </Link>
            </li>
            {partOfSite ? (
              <>
                <li aria-hidden="true">/</li>
                <li className="min-w-0 truncate">
                  <Link href={sourceHref(assistantId, source.id)} className="hover:text-foreground">
                    {source.title}
                  </Link>
                </li>
              </>
            ) : null}
          </ol>
        </nav>
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md"
            title={kind.label}
          >
            <kind.icon className="size-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="break-words text-xl font-semibold tracking-tight">{document.title}</h1>
            <p className="text-muted-foreground break-words text-xs">
              {document.url ? (
                <a
                  href={document.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground break-all"
                >
                  {document.url}
                </a>
              ) : (
                describeSource(source)
              )}
              <span> · indexed {relativeTime(document.updated_at)}</span>
            </p>
          </div>
        </div>
        {original ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={original.href} target="_blank" rel="noreferrer">
                <ExternalLink data-icon="inline-start" aria-hidden="true" />
                {original.label}
              </a>
            </Button>
          </div>
        ) : null}
      </header>

      {passage?.requested ? (
        matched ? (
          <div
            role="status"
            className="bg-accent/40 text-accent-foreground flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs"
          >
            <span>The highlighted passage is the one the answer cited.</span>
            <PassageJump />
          </div>
        ) : passage.content ? (
          <figure className="bg-card flex flex-col gap-2 rounded-lg border px-3 py-2.5">
            <figcaption className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Quote className="size-3.5" aria-hidden="true" />
              The passage the answer cited
            </figcaption>
            <blockquote
              className="whitespace-pre-wrap break-words text-sm leading-relaxed"
              data-testid="cited-passage"
            >
              {passage.content}
            </blockquote>
          </figure>
        ) : (
          <p role="status" className="text-muted-foreground rounded-lg border px-3 py-2 text-xs">
            The cited passage is no longer in this page: it was re-indexed after the answer. The page
            opens at the top.
          </p>
        )
      ) : null}

      <article
        className="bg-card min-w-0 rounded-xl border px-4 py-5 sm:px-6"
        aria-label={document.title}
      >
        {document.content.trim() ? (
          body
        ) : (
          <p className="text-muted-foreground text-sm">This page has no text.</p>
        )}
      </article>
    </div>
  );
};
