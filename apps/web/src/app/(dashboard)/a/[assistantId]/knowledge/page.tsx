import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { parseAddSourceTab } from '@/components/knowledge/add-source-tab';
import { KnowledgeScreen } from '@/components/knowledge/knowledge-screen';
import { PageContainer } from '@/components/page-header';
import { getAccountPlan } from '@/lib/account';
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
  const [assistant, sources, { plan }] = await Promise.all([
    getAssistant(assistantId),
    supabase
      .from('sources')
      .select('*')
      .eq('assistant_id', assistantId)
      .order('created_at', { ascending: false }),
    getAccountPlan(),
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
        // The pages meter is the sum of these rows' pages, the count the plan limit applies to.
        initialSources={sources.data}
        plan={{ name: plan.name, pages: plan.pages }}
        liveAi={hasLiveAiProvider()}
        // `?add=url` (the Overview's "Add docs") opens the Add source dialog on that tab.
        initialAddTab={parseAddSourceTab(query.add)}
      />
    </PageContainer>
  );
}
