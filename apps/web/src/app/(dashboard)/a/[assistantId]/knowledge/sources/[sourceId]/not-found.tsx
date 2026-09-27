import { KnowledgeNotFound } from '@/components/knowledge/knowledge-not-found';

export default function SourceNotFound() {
  return (
    <KnowledgeNotFound
      title="This source is not in the knowledge anymore"
      description="It was deleted, or it belongs to a different assistant. Knowledge lists what the assistant reads now."
    />
  );
}
