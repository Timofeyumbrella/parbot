'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * A page or source that is gone: deleted, or replaced when its source was re-indexed with new
 * content. Citations in older answers still point at it, so this says what happened and where
 * the current version lives.
 */
export const KnowledgeNotFound = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => {
  const params = useParams<{ assistantId?: string }>();
  const knowledgeHref = params.assistantId ? `/a/${params.assistantId}/knowledge` : '/dashboard';

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title={title} description={description} />
      <div>
        <Button asChild variant="outline" size="sm">
          <Link href={knowledgeHref}>Open Knowledge</Link>
        </Button>
      </div>
    </PageContainer>
  );
};
