'use client';

import { usePathname } from 'next/navigation';

import { ConversationSkeleton, InboxListSkeleton } from '@/components/inbox/skeletons';
import { isConversationPath } from '@/lib/analytics';

/**
 * This boundary also covers the conversation route below it: on a row click it is what shows
 * until that route's own boundary arrives, and the router has already moved the path by then.
 * Reading the path lets the skeleton take the right shape from the first frame.
 */
export default function InboxLoading() {
  const pathname = usePathname();

  return isConversationPath(pathname) ? <ConversationSkeleton /> : <InboxListSkeleton />;
}
