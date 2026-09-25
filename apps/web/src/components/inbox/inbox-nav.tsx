'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from 'cn';
import { useEffect } from 'react';

import { type InboxCounts, inboxCountsKey } from '@/components/inbox/conversation-query';
import {
  pillActiveClass,
  pillInactiveClass,
  pillLinkClass,
  pillNavClass,
  SegmentedLink,
} from '@/components/inbox/pending-nav';
import {
  CONVERSATION_FILTERS,
  type ConversationFilter,
  inboxHref,
  type InboxTab,
} from '@/lib/analytics';
import { formatCount } from '@/lib/format';

const FILTER_LABELS: Record<ConversationFilter, string> = {
  all: 'All',
  widget: 'Widget',
  app: 'In-app',
  unanswered: 'Unanswered',
};

/**
 * The tab counts as the page will show them: the server's numbers, kept current by the
 * conversation list's Realtime subscription through the shared query cache.
 */
const useLiveCounts = (assistantId: string, counts: InboxCounts, now: number) => {
  const queryClient = useQueryClient();
  const key = inboxCountsKey(assistantId);
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => counts,
    initialData: counts,
    initialDataUpdatedAt: now,
    staleTime: Infinity,
  });

  // A fresh server render outranks whatever an earlier visit left in the cache.
  useEffect(() => {
    const state = queryClient.getQueryState<InboxCounts>(key);

    if (state && state.dataUpdatedAt < now) {
      queryClient.setQueryData<InboxCounts>(key, counts, { updatedAt: now });
    }
    // The key derives from the assistant id; the counts belong to the render stamped `now`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantId, now, queryClient]);

  return data;
};

/** Conversations | Leads as links, so the open tab is part of the URL. */
export const InboxTabs = ({
  assistantId,
  tab,
  counts,
  now,
}: {
  assistantId: string;
  tab: InboxTab;
  counts: InboxCounts;
  now: number;
}) => {
  const live = useLiveCounts(assistantId, counts, now);

  return (
    <nav aria-label="Inbox sections" className="border-b">
      <ul className="-mb-px flex gap-4">
        {(
          [
            ['conversations', 'Conversations', live.conversations],
            ['leads', 'Leads', live.leads],
          ] as const
        ).map(([key, label, count]) => (
          <li key={key}>
            <SegmentedLink
              href={inboxHref(assistantId, key)}
              group="tab"
              active={key === tab}
              className="group flex h-9 items-center gap-2 border-b-2 text-sm font-medium transition-colors"
              activeClassName="border-foreground text-foreground"
              inactiveClassName="text-muted-foreground hover:text-foreground border-transparent"
            >
              {label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] tabular-nums leading-none',
                  'bg-muted/60 text-muted-foreground group-aria-[current=page]:bg-muted group-aria-[current=page]:text-foreground',
                )}
                data-testid={`${key}-count`}
              >
                {formatCount(count)}
              </span>
            </SegmentedLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};

/** All / Widget / In-app / Unanswered, as links that rewrite `?filter=`. */
export const ConversationFilters = ({
  assistantId,
  filter,
}: {
  assistantId: string;
  filter: ConversationFilter;
}) => (
  <nav aria-label="Filter conversations" className={pillNavClass}>
    {CONVERSATION_FILTERS.map((key) => (
      <SegmentedLink
        key={key}
        href={inboxHref(assistantId, 'conversations', key)}
        group="filter"
        active={key === filter}
        className={pillLinkClass}
        activeClassName={pillActiveClass}
        inactiveClassName={pillInactiveClass}
      >
        {FILTER_LABELS[key]}
      </SegmentedLink>
    ))}
  </nav>
);
