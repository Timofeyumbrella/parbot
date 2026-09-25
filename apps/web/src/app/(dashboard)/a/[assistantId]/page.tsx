import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PendingNav, PendingRegion } from '@/components/inbox/pending-nav';
import { DailyChart } from '@/components/overview/daily-chart';
import { FirstUse } from '@/components/overview/first-use';
import { PeriodSwitch } from '@/components/overview/period-switch';
import { TopQuestions, UnansweredQuestions } from '@/components/overview/question-lists';
import { RecentConversations } from '@/components/overview/recent-conversations';
import { StatTiles } from '@/components/overview/stat-tiles';
import { PageContainer, PageHeader } from '@/components/page-header';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { bucketDaily, parseDays, periodStart } from '@/lib/analytics';
import { getAssistant } from '@/lib/assistants';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Overview' };

const LIST_ROWS = 8;

export default async function OverviewPage({
  params,
  searchParams,
}: PageProps<'/a/[assistantId]'>) {
  const [{ assistantId }, query] = await Promise.all([params, searchParams]);
  const [{ supabase }, assistant] = await Promise.all([requireUser(), getAssistant(assistantId)]);

  if (!assistant) {
    notFound();
  }

  const days = parseDays(query.days);
  const now = new Date();
  const since = periodStart(days, now);
  const sinceIso = since.toISOString();

  const [stats, daily, top, unanswered, recent, messages] = await Promise.all([
    supabase.rpc('assistant_stats', { assistant: assistantId, since: sinceIso }),
    supabase.rpc('assistant_daily', { assistant: assistantId, since: sinceIso }),
    supabase.rpc('top_questions', { assistant: assistantId, since: sinceIso, max_rows: LIST_ROWS }),
    supabase.rpc('unanswered_questions', {
      assistant: assistantId,
      since: sinceIso,
      max_rows: LIST_ROWS,
    }),
    // Same order as the Inbox, so the two screens agree on what "recent" means.
    supabase
      .from('conversations')
      .select('id, title, channel, last_message_at, created_at, unanswered_count')
      .eq('assistant_id', assistantId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(LIST_ROWS),
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('assistant_id', assistantId),
  ]);

  const failure = [stats, daily, top, unanswered, recent, messages].find(
    (result) => result.error,
  )?.error;
  const firstUse = !failure && (messages.count ?? 0) === 0;
  const totals = stats.data?.[0];

  return (
    <PageContainer>
      {/* Every message bumps its conversation's counters, so this covers questions too. */}
      <RealtimeRefresh
        name={`overview:${assistantId}`}
        watch={[
          { table: 'conversations', filter: `assistant_id=eq.${assistantId}` },
          { table: 'leads', filter: `assistant_id=eq.${assistantId}` },
        ]}
      />
      <PendingNav>
        <PageHeader
          title="Overview"
          description={`How ${assistant.name} is doing.`}
          actions={firstUse ? undefined : <PeriodSwitch assistantId={assistantId} days={days} />}
        />

        {failure ? (
          <div
            role="alert"
            className="border-destructive/40 bg-destructive/10 rounded-lg border p-4 text-sm"
          >
            <p className="font-medium">The stats could not be loaded.</p>
            <p className="text-muted-foreground mt-1">
              The database did not answer as expected. Reload the page to try again; if it keeps
              happening, the assistant may have been deleted.
            </p>
          </div>
        ) : firstUse ? (
          <FirstUse assistantId={assistantId} assistantName={assistant.name} />
        ) : (
          <PendingRegion>
            <StatTiles
              days={days}
              conversations={Number(totals?.conversations ?? 0)}
              questions={Number(totals?.questions ?? 0)}
              answered={Number(totals?.answered ?? 0)}
              unanswered={Number(totals?.unanswered ?? 0)}
              leads={Number(totals?.leads ?? 0)}
            />
            <DailyChart rows={bucketDaily(daily.data ?? [], since, days)} days={days} />
            <div className="grid gap-4 lg:grid-cols-2">
              <TopQuestions rows={top.data ?? []} now={now.getTime()} />
              <UnansweredQuestions
                rows={unanswered.data ?? []}
                now={now.getTime()}
                assistantId={assistantId}
              />
            </div>
            <RecentConversations
              rows={recent.data ?? []}
              now={now.getTime()}
              assistantId={assistantId}
            />
          </PendingRegion>
        )}
      </PendingNav>
    </PageContainer>
  );
}
