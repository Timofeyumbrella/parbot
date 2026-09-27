import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { parseAddSourceTab } from '@/components/knowledge/add-source-dialog';
import { KnowledgeScreen } from '@/components/knowledge/knowledge-screen';
import { PageContainer } from '@/components/page-header';
import { getAccountPlan, getAccountUsage } from '@/lib/account';
import { hasLiveAiProvider } from '@/lib/ai';
import { getAssistant } from '@/lib/assistants';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Knowledge' };

export default async function KnowledgePage({
  params,
  searchParams,
}: PageProps<'/a/[assistantId]/knowledge'>) {
  const [{ assistantId }, query] = await Promise.all([params, searchParams]);
  const { supabase, user } = await requireUser();
  const [assistant, sources, { plan }, usage] = await Promise.all([
    getAssistant(assistantId),
    supabase
      .from('sources')
      .select('*')
      .eq('assistant_id', assistantId)
      .order('created_at', { ascending: false }),
    getAccountPlan(),
    getAccountUsage(),
  ]);

  if (!assistant) {
    notFound();
  }

  if (sources.error) {
    throw new Error(`The sources could not be loaded (${sources.error.message}).`);
  }

  return (
    <PageContainer>
      <KnowledgeScreen
        assistantId={assistant.id}
        ownerId={user.id}
        initialSources={sources.data}
        initialPagesUsed={usage.pages}
        plan={{ name: plan.name, pages: plan.pages }}
        liveAi={hasLiveAiProvider()}
        // `?add=url` (the Overview's "Add docs") opens the Add source dialog on that tab.
        initialAddTab={parseAddSourceTab(query.add)}
      />
    </PageContainer>
  );
}
