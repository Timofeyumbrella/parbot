import { notFound } from 'next/navigation';

import { AssistantProvider } from '@/components/assistant-context';
import { getAssistant } from '@/lib/assistants';

export default async function AssistantLayout({
  children,
  params,
}: LayoutProps<'/a/[assistantId]'>) {
  const { assistantId } = await params;
  const assistant = await getAssistant(assistantId);

  if (!assistant) {
    notFound();
  }

  return <AssistantProvider assistant={assistant}>{children}</AssistantProvider>;
}
