import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PendingNav, PendingRegion } from '@/components/inbox/pending-nav';
import { AnswerQuality } from '@/components/overview/answer-quality';
import { ContentUsage } from '@/components/overview/content-usage';
import { DislikedAnswers } from '@/components/overview/disliked-answers';
import { FirstUse } from '@/components/overview/first-use';
import { KnowledgeGaps } from '@/components/overview/knowledge-gaps';
import { LeadsSummary } from '@/components/overview/leads-summary';
import { PeriodSwitch } from '@/components/overview/period-switch';
import { PlanUsage } from '@/components/overview/plan-usage';
import { ReaderPages } from '@/components/overview/reader-pages';
import { PageContainer, PageHeader } from '@/components/page-header';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { getAccountPlan } from '@/lib/account';
import { bucketDaily, parseDays, periodStart } from '@/lib/analytics';
import { getAssistant } from '@/lib/assistants';
import {
  EMPTY_TOTALS,
  firstLine,
  groupGaps,
  type PeriodTotals,
  previousPeriodStart,
  projectUsage,
} from '@/lib/overview';
import { usagePeriodStart } from '@/lib/plans';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Overview' };

/** Wordings fetched for grouping; far more than a period of real traffic leaves unanswered. */
const GAP_WORDINGS = 200;
const GAP_ROWS = 8;
const DISLIKED_ROWS = 5;
const DOCUMENT_ROWS = 5;
const PAGE_ROWS = 6;

type TotalsRow = {
  period: string;
  questions: number;
  answered: number;
  unanswered: number;
  positive: number;
  negative: number;
  median_latency_ms: number | null;
  leads: number;
  new_leads: number;
};

const toTotals = (row: TotalsRow | undefined): PeriodTotals =>
  row
    ? {
        questions: Number(row.questions),
        answered: Number(row.answered),
        unanswered: Number(row.unanswered),
        positive: Number(row.positive),
        negative: Number(row.negative),
        medianLatencyMs: row.median_latency_ms === null ? null : Number(row.median_latency_ms),
        leads: Number(row.leads),
        newLeads: Number(row.new_leads),
      }
    : EMPTY_TOTALS;

/** A total counted before the limit rides on every row; no rows means none at all. */
const totalOf = (rows: { total: number }[] | null) => Number(rows?.[0]?.total ?? 0);

export default async function OverviewPage({
  params,
  searchParams,
}: PageProps<'/a/[assistantId]'>) {
  const [{ assistantId }, query] = await Promise.all([params, searchParams]);
  const [{ supabase, user }, assistant] = await Promise.all([
    requireUser(),
    getAssistant(assistantId),
  ]);

  if (!assistant) {
    notFound();
  }

  const days = parseDays(query.days);
  const now = new Date();
  const since = periodStart(days, now);
  const sinceIso = since.toISOString();
  const range = { assistant: assistantId, since: sinceIso };

  // Every read goes through the owner's session, so row level security scopes each one.
  const [account, usage, totals, daily, gaps, disliked, cited, uncited, pages, indexed, messages] =
    await Promise.all([
      getAccountPlan(),
      supabase
        .from('usage_counters')
        .select('value')
        .eq('owner_id', user.id)
        .eq('metric', 'messages')
        .eq('period_start', usagePeriodStart(now))
        .maybeSingle(),
      supabase.rpc('overview_totals', {
        ...range,
        previous_since: previousPeriodStart(since, days).toISOString(),
      }),
      supabase.rpc('assistant_daily', range),
      supabase.rpc('knowledge_gaps', { ...range, max_rows: GAP_WORDINGS }),
      supabase.rpc('disliked_answers', { ...range, max_rows: DISLIKED_ROWS }),
      supabase.rpc('cited_documents', { ...range, max_rows: DOCUMENT_ROWS }),
      supabase.rpc('uncited_documents', { ...range, max_rows: DOCUMENT_ROWS }),
      supabase.rpc('page_activity', { ...range, max_rows: PAGE_ROWS }),
      supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('assistant_id', assistantId),
      // One row tells a new assistant from a quiet period; there is no need to count them all.
      supabase.from('messages').select('id').eq('assistant_id', assistantId).limit(1),
    ]);

  const failure = [
    usage,
    totals,
    daily,
    gaps,
    disliked,
    cited,
    uncited,
    pages,
    indexed,
    messages,
  ].find((result) => result.error)?.error;

  if (failure) {
    console.error('[overview] a query failed', failure);
  }

  const firstUse = !failure && (messages.data ?? []).length === 0;
  const clock = now.getTime();
  const totalsRows = (totals.data ?? []) as TotalsRow[];
  const current = toTotals(totalsRows.find((row) => row.period === 'current'));
  const previous = toTotals(totalsRows.find((row) => row.period === 'previous'));
  const gapGroups = groupGaps(
    (gaps.data ?? []).map((row) => ({
      question: row.question,
      asks: Number(row.asks),
      lastAskedAt: row.last_asked_at,
      conversationId: row.conversation_id,
    })),
  );

  return (
    <PageContainer>
      {/* Messages cover new questions and ratings; conversations cover deletions; leads their own. */}
      <RealtimeRefresh
        name={`overview:${assistantId}`}
        watch={[
          { table: 'messages', filter: `assistant_id=eq.${assistantId}` },
          { table: 'conversations', filter: `assistant_id=eq.${assistantId}` },
          { table: 'leads', filter: `assistant_id=eq.${assistantId}` },
        ]}
      />
      <PendingNav>
        <PageHeader
          title="Overview"
          description={`What readers need from ${assistant.name}, and what to fix in the docs next.`}
          actions={firstUse ? undefined : <PeriodSwitch assistantId={assistantId} days={days} />}
        />

        {failure ? (
          <div
            role="alert"
            className="border-destructive/40 bg-destructive/10 rounded-lg border p-4 text-sm"
          >
            <p className="font-medium">The overview could not be loaded.</p>
            <p className="text-muted-foreground mt-1">
              The database did not answer as expected. Reload the page to try again; if it keeps
              happening, the assistant may have been deleted.
            </p>
          </div>
        ) : firstUse ? (
          <FirstUse assistantId={assistantId} assistantName={assistant.name} />
        ) : (
          <PendingRegion>
            <AnswerQuality
              assistantId={assistantId}
              days={days}
              current={current}
              previous={previous}
              daily={bucketDaily(daily.data ?? [], since, days)}
            />

            <KnowledgeGaps
              assistantId={assistantId}
              gaps={gapGroups.slice(0, GAP_ROWS)}
              total={gapGroups.length}
              now={clock}
            />

            <div className="grid gap-6 lg:grid-cols-2">
              <DislikedAnswers
                assistantId={assistantId}
                answers={(disliked.data ?? []).map((row) => ({
                  messageId: row.message_id,
                  conversationId: row.conversation_id,
                  answeredAt: row.answered_at,
                  question: (row.question as string | null) ?? null,
                  preview: firstLine(row.answer),
                }))}
                total={totalOf(disliked.data)}
                now={clock}
              />
              <ReaderPages
                assistantId={assistantId}
                pages={(pages.data ?? []).map((row) => ({
                  host: row.host,
                  path: row.path,
                  pageUrl: row.page_url,
                  questions: Number(row.questions),
                  answered: Number(row.answered),
                  unanswered: Number(row.unanswered),
                }))}
                total={totalOf(pages.data)}
              />
            </div>

            <ContentUsage
              assistantId={assistantId}
              days={days}
              cited={(cited.data ?? []).map((row) => ({
                documentId: (row.document_id as string | null) ?? null,
                title: row.title,
                url: (row.url as string | null) ?? null,
                sourceTitle: (row.source_title as string | null) ?? null,
                sourceKind: row.source_kind ?? null,
                answers: Number(row.answers),
              }))}
              citedTotal={totalOf(cited.data)}
              uncited={(uncited.data ?? []).map((row) => ({
                documentId: row.document_id,
                title: row.title,
                url: (row.url as string | null) ?? null,
                sourceTitle: row.source_title,
                sourceKind: row.source_kind,
                createdAt: row.created_at,
              }))}
              uncitedTotal={totalOf(uncited.data)}
              indexed={indexed.count ?? 0}
              now={clock}
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <PlanUsage
                planName={account.plan.name}
                projection={projectUsage({
                  used: Number(usage.data?.value ?? 0),
                  limit: account.plan.messagesPerMonth,
                  now,
                })}
              />
              <LeadsSummary
                assistantId={assistantId}
                days={days}
                leads={current.leads}
                newLeads={current.newLeads}
                leadCapture={assistant.lead_capture}
                planAllowsLeads={account.plan.leadCapture}
              />
            </div>
          </PendingRegion>
        )}
      </PendingNav>
    </PageContainer>
  );
}
