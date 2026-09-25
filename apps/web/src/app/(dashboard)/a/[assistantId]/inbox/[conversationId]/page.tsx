import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { ChannelBadge } from '@/components/inbox/channel-badge';
import { ConversationPanel } from '@/components/inbox/conversation-panel';
import { TranscriptMessage } from '@/components/inbox/transcript-message';
import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { getAssistant } from '@/lib/assistants';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Conversation' };

const idSchema = z.uuid();

export default async function ConversationPage({
  params,
}: PageProps<'/a/[assistantId]/inbox/[conversationId]'>) {
  const { assistantId, conversationId } = await params;

  // Postgres rejects a malformed uuid with an error; to the reader it is simply not there.
  if (!idSchema.safeParse(conversationId).success) {
    notFound();
  }

  const [{ supabase }, assistant] = await Promise.all([requireUser(), getAssistant(assistantId)]);

  if (!assistant) {
    notFound();
  }

  const [conversation, messages, leads] = await Promise.all([
    supabase
      .from('conversations')
      .select(
        'id, assistant_id, channel, visitor_id, title, page_url, created_at, message_count, unanswered_count',
      )
      .eq('id', conversationId)
      .eq('assistant_id', assistantId)
      .maybeSingle(),
    supabase
      .from('messages')
      .select('id, role, content, citations, answered, feedback, created_at')
      .eq('conversation_id', conversationId)
      .eq('assistant_id', assistantId)
      .order('created_at', { ascending: true }),
    supabase
      .from('leads')
      .select('id, email, status')
      .eq('conversation_id', conversationId)
      .eq('assistant_id', assistantId)
      .order('created_at', { ascending: true }),
  ]);

  if (conversation.error) {
    throw new Error(
      'The conversation could not be loaded because the database did not answer as expected.',
    );
  }

  if (!conversation.data) {
    notFound();
  }

  // One request-scoped clock so every relative time on the page agrees.
  const now = new Date().getTime();
  const failure = messages.error ?? leads.error;

  return (
    <PageContainer>
      <div className="flex flex-col gap-3">
        <Link
          href={`/a/${assistantId}/inbox`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Inbox
        </Link>
        <PageHeader
          title={conversation.data.title || 'Untitled conversation'}
          description="A read-only transcript of what was asked and what the assistant answered."
          actions={<ChannelBadge channel={conversation.data.channel} />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section aria-label="Transcript" className="flex flex-col gap-5">
          {failure ? (
            <div
              role="alert"
              className="border-destructive/40 bg-destructive/10 rounded-lg border p-4 text-sm"
            >
              <p className="font-medium">The transcript could not be loaded.</p>
              <p className="text-muted-foreground mt-1">
                The database did not answer as expected. Reload the page to try again.
              </p>
            </div>
          ) : (messages.data ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
              <p className="font-medium">No messages in this conversation</p>
              <p className="text-muted-foreground max-w-md text-sm">
                It was started but nothing was asked. Delete it from the panel if it is just noise.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link href={`/a/${assistantId}/inbox`}>Back to the inbox</Link>
              </Button>
            </div>
          ) : (
            (messages.data ?? []).map((message) => (
              <TranscriptMessage key={message.id} message={message} now={now} />
            ))
          )}
        </section>

        <aside>
          <ConversationPanel conversation={conversation.data} leads={leads.data ?? []} now={now} />
        </aside>
      </div>
    </PageContainer>
  );
}
