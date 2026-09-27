import { ExternalLink, FileText, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DocumentViewer } from '@/components/knowledge/document-viewer';
import { isActiveStatus, plural, SOURCE_KINDS } from '@/components/knowledge/format';
import { ViewerBack } from '@/components/knowledge/viewer-controls';
import { PageContainer } from '@/components/page-header';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { Button } from '@/components/ui/button';
import {
  documentHref,
  hasStoredFile,
  originalLabel,
  sourceFileHref,
} from '@/lib/knowledge/links';
import { loadSource, loadSourcePages } from '@/lib/knowledge/documents';

type Props = PageProps<'/a/[assistantId]/knowledge/sources/[sourceId]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { assistantId, sourceId } = await params;
  const loaded = await loadSource(assistantId, sourceId);

  return { title: loaded?.source.title ?? 'Source' };
}

/**
 * A source's text. A file or pasted text is one page, shown in the viewer straight away; a website
 * lists its pages; a source still being indexed says so and fills in when indexing finishes. This
 * is where a reference chip in the chat leads, since a chip names a source, not a page.
 */
export default async function SourcePage({ params }: Props) {
  const { assistantId, sourceId } = await params;
  const loaded = await loadSource(assistantId, sourceId);

  if (!loaded) {
    notFound();
  }

  const { source, pageCount, firstPage } = loaded;

  if (pageCount === 1 && firstPage) {
    return (
      <PageContainer className="max-w-3xl">
        <DocumentViewer assistantId={assistantId} document={firstPage} source={source} />
      </PageContainer>
    );
  }

  const kind = SOURCE_KINDS[source.kind];
  const knowledgeHref = `/a/${assistantId}/knowledge`;
  const original = hasStoredFile(source.kind)
    ? { href: sourceFileHref(source.id), label: originalLabel(source.kind) }
    : source.uri
      ? { href: source.uri, label: 'Open site' }
      : null;
  const pages = pageCount > 1 ? await loadSourcePages(assistantId, sourceId) : [];
  const indexing = isActiveStatus(source.status);

  return (
    <PageContainer className="max-w-3xl">
      {indexing ? (
        <RealtimeRefresh
          name={`knowledge:source:${sourceId}`}
          watch={[{ table: 'sources', filter: `id=eq.${sourceId}` }]}
        />
      ) : null}
      <div className="flex flex-col gap-5" data-testid="source-pages">
        <ViewerBack fallback={knowledgeHref} />
        <header className="flex flex-col gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md"
              title={kind.label}
            >
              <kind.icon className="size-4" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="break-words text-xl font-semibold tracking-tight">{source.title}</h1>
              <p className="text-muted-foreground text-xs">
                {kind.label} · {plural(pageCount, 'page')}
              </p>
            </div>
          </div>
          {original ? (
            <div>
              <Button asChild variant="outline" size="sm">
                <a href={original.href} target="_blank" rel="noreferrer">
                  <ExternalLink data-icon="inline-start" aria-hidden="true" />
                  {original.label}
                </a>
              </Button>
            </div>
          ) : null}
        </header>

        {pageCount === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed px-4 py-6 text-sm">
            {indexing ? (
              <p role="status" className="flex items-center gap-2">
                <LoaderCircle className="text-muted-foreground size-4 animate-spin" aria-hidden />
                Indexing {source.title}. Its text shows here as soon as it is ready.
              </p>
            ) : source.status === 'failed' ? (
              <>
                <p className="text-destructive flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="break-words">
                    {source.error ?? 'Indexing failed, so there is no text to show.'}
                  </span>
                </p>
                <p className="text-muted-foreground">Re-index it from Knowledge to try again.</p>
              </>
            ) : (
              <p className="text-muted-foreground">
                Nothing was indexed from this source. Re-index it from Knowledge.
              </p>
            )}
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link href={knowledgeHref}>Open Knowledge</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-border bg-card divide-y rounded-xl border" aria-label="Pages">
            {pages.map((page) => (
              <li key={page.id} className="flex min-w-0 items-start gap-3 px-4 py-3">
                <FileText className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Link
                    href={documentHref(assistantId, page.id)}
                    className="hover:text-primary truncate text-sm font-medium"
                  >
                    {page.title}
                  </Link>
                  {page.url ? (
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground truncate text-xs"
                    >
                      {page.url}
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
