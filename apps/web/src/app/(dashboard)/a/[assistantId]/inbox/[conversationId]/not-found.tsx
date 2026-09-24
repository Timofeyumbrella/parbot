'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export default function ConversationNotFound() {
  const params = useParams<{ assistantId?: string }>();
  const inboxHref = params.assistantId ? `/a/${params.assistantId}/inbox` : '/dashboard';

  return (
    <PageContainer>
      <PageHeader
        title="Conversation not found"
        description="It may have been deleted, or it belongs to a different assistant."
      />
      <div>
        <Button asChild variant="outline" size="sm">
          <Link href={inboxHref}>Back to the inbox</Link>
        </Button>
      </div>
    </PageContainer>
  );
}
