import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CONVERSATION_COLUMNS, ConversationList, PAGE_SIZE } from '@/components/inbox/conversation-list';
import { ConversationFilters, InboxTabs } from '@/components/inbox/inbox-nav';
import { LeadsTable } from '@/components/inbox/leads-table';
import { PageContainer, PageHeader } from '@/components/page-header';
import { parseConversationFilter, parseInboxTab } from '@/lib/analytics';
import { getAssistant } from '@/lib/assistants';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Inbox' };

const LEAD_ROWS = 200;

export default async function InboxPage({ params, searchParams }: PageProps<'/a/[assistantId]/inbox'>) {
  const [{ assistantId }, query] = await Promise.all([params, searchParams]);
  const [{ supabase }, assistant] = await Promise.all([requireUser(), getAssistant(assistantId)]);

  if (!assistant) {
    notFound();
  }

  const tab = parseInboxTab(query.tab);
  const filter = parseConversationFilter(query.filter);
  // One request-scoped clock so every relative time on the page agrees.
  const now = new Date().getTime();

  let conversations = supabase
    .from('conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('assistant_id', assistantId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(tab === 'conversations' ? PAGE_SIZE : 0);

  if (filter === 'widget' || filter === 'app') {
    conversations = conversations.eq('channel', filter);
  } else if (filter === 'unanswered') {
    conversations = conversations.gt('unanswered_count', 0);
  }

  const [rows, leads, conversationCount, leadCount] = await Promise.all([
    conversations,
    supabase
      .from('leads')
      .select('id, email, note, page_url, status, created_at, conversation_id')
      .eq('assistant_id', assistantId)
      .order('created_at', { ascending: false })
      .limit(tab === 'leads' ? LEAD_ROWS : 0),
    supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('assistant_id', assistantId),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('assistant_id', assistantId),
  ]);

  const failure = [rows, leads, conversationCount, leadCount].find((result) => result.error)?.error;

  return (
    <PageContainer>
      <PageHeader title="Inbox" description={`Every conversation ${assistant.name} had, and the leads it captured.`} />

      <InboxTabs
        assistantId={assistantId}
        tab={tab}
        counts={{ conversations: conversationCount.count ?? 0, leads: leadCount.count ?? 0 }}
      />

      {failure ? (
        <div role="alert" className="border-destructive/40 bg-destructive/10 rounded-lg border p-4 text-sm">
          <p className="font-medium">The inbox could not be loaded.</p>
          <p className="text-muted-foreground mt-1">
            The database answered with an error: {failure.message}. Reload the page to try again.
          </p>
        </div>
      ) : tab === 'leads' ? (
        <LeadsTable rows={leads.data ?? []} assistantId={assistantId} now={now} />
      ) : (
        <>
          <ConversationFilters assistantId={assistantId} filter={filter} />
          <ConversationList
            key={filter}
            assistantId={assistantId}
            filter={filter}
            initialRows={rows.data ?? []}
            now={now}
          />
        </>
      )}
    </PageContainer>
  );
}
