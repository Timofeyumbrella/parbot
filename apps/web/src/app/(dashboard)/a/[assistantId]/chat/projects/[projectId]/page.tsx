import type { Metadata } from 'next';

import { ProjectHome } from '@/components/chat/project-home';

export const metadata: Metadata = { title: 'Chat' };

/**
 * A project's home, where its new chats start. Thin like the conversation page: the project comes
 * from the client cache the layout seeds, so one created a moment ago opens at once.
 */
export default async function ProjectPage({
  params,
}: PageProps<'/a/[assistantId]/chat/projects/[projectId]'>) {
  const { projectId } = await params;

  return <ProjectHome projectId={projectId} />;
}
