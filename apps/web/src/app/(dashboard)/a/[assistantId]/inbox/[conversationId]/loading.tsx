import { ConversationSkeleton } from '@/components/inbox/skeletons';

/** Shaped like a conversation; the inbox boundary above shows the same shape while this one loads. */
export default function ConversationLoading() {
  return <ConversationSkeleton />;
}
