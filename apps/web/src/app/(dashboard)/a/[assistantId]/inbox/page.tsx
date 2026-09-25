import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ConversationList } from '@/components/inbox/conversation-list';
import { conversationPage } from '@/components/inbox/conversation-query';
import { ConversationFilters, InboxTabs } from '@/components/inbox/inbox-nav';
import { LeadsTable } from '@/components/inbox/leads-table';
import { PendingNav, PendingRegion } from '@/components/inbox/pending-nav';
import { PageContainer, PageHeader } from '@/components/page-header';
import { parseConversationFilter, parseInboxTab } from '@/lib/analytics';
import { getAssistant } from '@/lib/assistants';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Inbox' };

const LEAD_ROWS = 200;

export default async function InboxPage({
  params,
  searchParams,
}: PageProps<'/a/[assistantId]/inbox'>) {
  const [{ assistantId }, query] = await Promise.all([params, searchParams]);
  const [{ supabase }, assistant] = await Promise.all([requireUser(), getAssistant(assistantId)]);

  if (!assistant) {
    notFound();
  }

  const tab = parseInboxTab(query.tab);
  const filter = parseConversationFilter(query.filter);
  // One request-scoped clock so every relative time on the page agrees.
  const now = new Date().getTime();

  // Only the open tab's rows are fetched; both counts are cheap and label the tabs.
  const [conversations, leads, conversationCount, leadCount] = await Promise.all([
    tab === 'conversations' ? conversationPage(supabase, assistantId, filter) : null,
    tab === 'leads'
      ? supabase
          .from('leads')
          .select('id, email, note, page_url, status, created_at, conversation_id')
          .eq('assistant_id', assistantId)
          .order('created_at', { ascending: false })
          .limit(LEAD_ROWS)
      : null,
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('assistant_id', assistantId),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('assistant_id', assistantId),
  ]);

  const failure = [conversations, leads, conversationCount, leadCount].find(
    (result) => result?.error,
  )?.error;

  return (
    <PageContainer>
      <PageHeader
        title="Inbox"
        description={`Every conversation ${assistant.name} had, and the leads it captured.`}
      />

      <PendingNav>
        <InboxTabs
          assistantId={assistantId}
          tab={tab}
          counts={{ conversations: conversationCount.count ?? 0, leads: leadCount.count ?? 0 }}
          now={now}
        />

        {failure ? (
          <div
            role="alert"
            className="border-destructive/40 bg-destructive/10 rounded-lg border p-4 text-sm"
          >
            <p className="font-medium">The inbox could not be loaded.</p>
            <p className="text-muted-foreground mt-1">
              The database did not answer as expected. Reload the page to try again; if it keeps
              happening, the assistant may have been deleted.
            </p>
          </div>
        ) : tab === 'leads' ? (
          <PendingRegion>
            <LeadsTable rows={leads?.data ?? []} assistantId={assistantId} now={now} />
          </PendingRegion>
        ) : (
          <PendingRegion className="gap-4">
            <ConversationFilters assistantId={assistantId} filter={filter} />
            <ConversationList
              key={filter}
              assistantId={assistantId}
              filter={filter}
              initialRows={conversations?.data ?? []}
              now={now}
            />
          </PendingRegion>
        )}
      </PendingNav>
    </PageContainer>
  );
}
