import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DocumentViewer } from '@/components/knowledge/document-viewer';
import { PageContainer } from '@/components/page-header';
import { loadDocument, loadPassage } from '@/lib/knowledge/documents';

type Props = PageProps<'/a/[assistantId]/knowledge/documents/[documentId]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { assistantId, documentId } = await params;
  const document = await loadDocument(assistantId, documentId);

  return { title: document?.title ?? 'Document' };
}

/**
 * One indexed page, as the assistant reads it. `?passage=<chunk id>` comes from a citation: the
 * passage is highlighted and scrolled to, or quoted when the page no longer lays it out the same.
 */
export default async function DocumentPage({ params, searchParams }: Props) {
  const [{ assistantId, documentId }, { passage }] = await Promise.all([params, searchParams]);
  const requested = typeof passage === 'string' && passage.length > 0;
  const [document, passageContent] = await Promise.all([
    loadDocument(assistantId, documentId),
    requested ? loadPassage(documentId, passage) : null,
  ]);

  if (!document) {
    notFound();
  }

  return (
    <PageContainer className="max-w-3xl">
      <DocumentViewer
        assistantId={assistantId}
        document={document}
        source={document.source}
        passage={requested ? { requested, content: passageContent } : undefined}
      />
    </PageContainer>
  );
}
