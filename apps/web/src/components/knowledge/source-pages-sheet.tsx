'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpenText, ExternalLink } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { Source } from '@/lib/db';
import {
  documentHref,
  hasStoredFile,
  originalLabel,
  sourceFileHref,
} from '@/lib/knowledge/links';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

import { plural } from './format';

export type SourcePage = { id: string; title: string; url: string | null; chunkCount: number };

export const sourcePagesQueryKey = (sourceId: string) => ['knowledge', 'pages', sourceId] as const;

export const loadSourcePages = async (sourceId: string): Promise<SourcePage[]> => {
  const { data, error } = await getSupabaseBrowserClient()
    .from('documents')
    .select('id, title, url, chunks(count)')
    .eq('source_id', sourceId)
    .order('title', { ascending: true });

  if (error) {
    throw new Error(`The pages could not be loaded (${error.message}).`);
  }

  return data.map((document) => ({
    id: document.id,
    title: document.title,
    url: document.url,
    chunkCount: document.chunks[0]?.count ?? 0,
  }));
};

type SourcePagesSheetProps = {
  source: Pick<Source, 'id' | 'assistant_id' | 'kind' | 'title' | 'document_count'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Every page a source contributed: its text in the viewer, the page itself or the stored file, and
 * how many passages it became.
 */
export const SourcePagesSheet = ({ source, open, onOpenChange }: SourcePagesSheetProps) => {
  const pages = useQuery({
    queryKey: sourcePagesQueryKey(source.id),
    queryFn: () => loadSourcePages(source.id),
    enabled: open,
    // A re-index changes the list, so every opening asks again.
    staleTime: 0,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle className="truncate">{source.title}</SheetTitle>
          <SheetDescription>
            {plural(pages.data?.length ?? source.document_count, 'page')} indexed
          </SheetDescription>
          {hasStoredFile(source.kind) ? (
            <div className="pt-1">
              <Button asChild variant="outline" size="sm">
                <a href={sourceFileHref(source.id)} target="_blank" rel="noreferrer">
                  <ExternalLink data-icon="inline-start" aria-hidden="true" />
                  {originalLabel(source.kind)}
                </a>
              </Button>
            </div>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {pages.isPending ? (
            <ul className="flex flex-col gap-3" aria-label="Loading pages">
              {Array.from({ length: 5 }, (_, index) => (
                <li key={index} className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </li>
              ))}
            </ul>
          ) : pages.isError ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-destructive text-sm">{pages.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => void pages.refetch()}>
                Try again
              </Button>
            </div>
          ) : pages.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No pages yet. They appear here once indexing has finished.
            </p>
          ) : (
            <ul className="divide-border flex flex-col divide-y">
              {pages.data.map((page) => (
                <li key={page.id} className="flex flex-col gap-0.5 py-2.5">
                  <span className="truncate text-sm font-medium">{page.title}</span>
                  <Link
                    href={documentHref(source.assistant_id, page.id)}
                    onClick={() => onOpenChange(false)}
                    className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-xs"
                  >
                    <BookOpenText className="size-3 shrink-0" aria-hidden="true" />
                    View text
                  </Link>
                  {page.url ? (
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground inline-flex min-w-0 items-center gap-1 text-xs"
                    >
                      <span className="truncate">{page.url}</span>
                      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                    </a>
                  ) : null}
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {plural(page.chunkCount, 'passage')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
