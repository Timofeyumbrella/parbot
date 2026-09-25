import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AssistantSettingsForm } from '@/components/assistants/assistant-settings-form';
import { DeleteAssistantCard } from '@/components/assistants/delete-assistant-card';
import { RegenerateKeyCard } from '@/components/assistants/regenerate-key-card';
import { PageContainer, PageHeader } from '@/components/page-header';
import { getAssistant } from '@/lib/assistants';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({ params }: PageProps<'/a/[assistantId]/settings'>) {
  const { assistantId } = await params;
  const assistant = await getAssistant(assistantId);

  if (!assistant) {
    notFound();
  }

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        description={`What ${assistant.name} is called and how it answers. The Widget page handles its welcome message, suggested questions, appearance, mode and allowed origins.`}
      />
      <AssistantSettingsForm
        assistant={{
          id: assistant.id,
          name: assistant.name,
          slug: assistant.slug,
          description: assistant.description,
          instructions: assistant.instructions,
        }}
      />
      <RegenerateKeyCard assistantId={assistant.id} publicKey={assistant.public_key} />
      <section aria-label="Danger zone" className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Danger zone
        </h2>
        <DeleteAssistantCard assistantId={assistant.id} name={assistant.name} />
      </section>
    </PageContainer>
  );
}
