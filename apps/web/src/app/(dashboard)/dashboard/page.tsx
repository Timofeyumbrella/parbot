import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AssistantCard, type AssistantCardData } from '@/components/assistants/assistant-card';
import { NewAssistantButton } from '@/components/assistants/new-assistant-button';
import { PlanStrip } from '@/components/assistants/plan-strip';
import { PageContainer, PageHeader } from '@/components/page-header';
import { getAccountPlan, getAccountUsage } from '@/lib/account';
import { listAssistants } from '@/lib/assistants';
import { checkCapacity } from '@/lib/plans';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Assistants' };

const DAY_MS = 86_400_000;

const embeddedCount = (rows: { count: number }[] | null | undefined) => rows?.[0]?.count ?? 0;

/** Start of the window the conversation count covers. Read once per request, not per render. */
const conversationWindowStart = () => new Date(Date.now() - 30 * DAY_MS).toISOString();

export default async function DashboardPage() {
  const { supabase } = await requireUser();
  const summaries = await listAssistants();

  if (summaries.length === 0) {
    redirect('/onboarding');
  }

  const since = conversationWindowStart();
  const [{ data: rows, error }, account, usage] = await Promise.all([
    supabase
      .from('assistants')
      .select('id, name, slug, created_at, documents(count), conversations(count)')
      .gte('conversations.created_at', since)
      .order('created_at', { ascending: true }),
    getAccountPlan(),
    getAccountUsage(),
  ]);

  if (error) {
    throw new Error(`The assistants could not be loaded: ${error.message}`);
  }

  const assistants: AssistantCardData[] = (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    pagesIndexed: embeddedCount(row.documents),
    conversationsLast30Days: embeddedCount(row.conversations),
  }));
  const capacity = checkCapacity(account.plan.id, usage.assistants, 'assistants');

  return (
    <PageContainer>
      <PageHeader
        title="Assistants"
        description="Each assistant answers from its own documentation. Open one to add docs, read the inbox or install the widget."
        actions={<NewAssistantButton capacity={capacity} planName={account.plan.name} />}
      />
      <PlanStrip plan={account.plan} usage={usage} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Your assistants">
        {assistants.map((assistant) => (
          <li key={assistant.id} className="contents">
            <AssistantCard assistant={assistant} />
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
