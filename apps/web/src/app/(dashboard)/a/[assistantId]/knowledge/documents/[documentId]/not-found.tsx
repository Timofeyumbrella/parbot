import { KnowledgeNotFound } from '@/components/knowledge/knowledge-not-found';

export default function DocumentNotFound() {
  return (
    <KnowledgeNotFound
      title="This page is not in the knowledge anymore"
      description="Its source was deleted, or re-indexed with new content that replaced it. Knowledge lists what the assistant reads now."
    />
  );
}
