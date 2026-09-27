import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageContainer, PageHeader } from '@/components/page-header';
import { WidgetScreen } from '@/components/widget/widget-screen';
import { getAccountPlan } from '@/lib/account';
import { getAssistant } from '@/lib/assistants';
import { publicEnv } from '@/lib/env';
import { getSession } from '@/lib/session';
import { installSnippet, widgetConfigVersion, widgetSettingsOf } from '@/lib/widget-api';

export const metadata: Metadata = { title: 'Widget' };

export default async function WidgetPage({ params }: PageProps<'/a/[assistantId]/widget'>) {
  const { assistantId } = await params;
  const [assistant, { plan }, { supabase }] = await Promise.all([
    getAssistant(assistantId),
    getAccountPlan(),
    getSession(),
  ]);

  if (!assistant) {
    notFound();
  }

  const { count } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('assistant_id', assistant.id);

  return (
    <PageContainer>
      <PageHeader
        title="Widget"
        description="How the assistant looks on your site, and the one tag that installs it."
      />
      <WidgetScreen
        assistantId={assistant.id}
        publicKey={assistant.public_key}
        settings={widgetSettingsOf(assistant)}
        version={widgetConfigVersion(assistant.updated_at)}
        gates={{
          palette: plan.palette,
          customTheme: plan.customTheme,
          hideBranding: plan.hideBranding,
          leadCapture: plan.leadCapture,
        }}
        snippet={installSnippet(assistant.public_key)}
        appUrl={publicEnv.appUrl.replace(/\/+$/, '')}
        hasSources={(count ?? 0) > 0}
      />
    </PageContainer>
  );
}
