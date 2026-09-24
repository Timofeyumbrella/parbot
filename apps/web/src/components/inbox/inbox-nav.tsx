import { cn } from 'cn';
import Link from 'next/link';

import { CONVERSATION_FILTERS, type ConversationFilter, formatCount, type InboxTab } from '@/lib/analytics';

const FILTER_LABELS: Record<ConversationFilter, string> = {
  all: 'All',
  widget: 'Widget',
  app: 'In-app',
  unanswered: 'Unanswered',
};

const inboxHref = (assistantId: string, tab: InboxTab, filter: ConversationFilter = 'all') => {
  const params = new URLSearchParams();

  if (tab !== 'conversations') {
    params.set('tab', tab);
  }

  if (tab === 'conversations' && filter !== 'all') {
    params.set('filter', filter);
  }

  const query = params.toString();

  return `/a/${assistantId}/inbox${query ? `?${query}` : ''}`;
};

/** Conversations | Leads as links, so the open tab is part of the URL. */
export const InboxTabs = ({
  assistantId,
  tab,
  counts,
}: {
  assistantId: string;
  tab: InboxTab;
  counts: { conversations: number; leads: number };
}) => (
  <nav aria-label="Inbox sections" className="border-b">
    <ul className="-mb-px flex gap-4">
      {(
        [
          ['conversations', 'Conversations', counts.conversations],
          ['leads', 'Leads', counts.leads],
        ] as const
      ).map(([key, label, count]) => {
        const active = key === tab;

        return (
          <li key={key}>
            <Link
              href={inboxHref(assistantId, key)}
              prefetch
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-2 border-b-2 text-sm font-medium transition-colors',
                active
                  ? 'border-foreground text-foreground'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )}
            >
              {label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] leading-none tabular-nums',
                  active ? 'bg-muted text-foreground' : 'bg-muted/60 text-muted-foreground',
                )}
              >
                {formatCount(count)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  </nav>
);

/** All / Widget / In-app / Unanswered, as links that rewrite `?filter=`. */
export const ConversationFilters = ({ assistantId, filter }: { assistantId: string; filter: ConversationFilter }) => (
  <nav aria-label="Filter conversations" className="bg-muted text-muted-foreground inline-flex h-8 items-center rounded-lg p-[3px]">
    {CONVERSATION_FILTERS.map((key) => {
      const active = key === filter;

      return (
        <Link
          key={key}
          href={inboxHref(assistantId, 'conversations', key)}
          prefetch
          aria-current={active ? 'page' : undefined}
          className={cn(
            'inline-flex h-full items-center rounded-md px-2.5 text-sm font-medium transition-colors',
            active
              ? 'bg-background text-foreground dark:bg-input/30 dark:border-input border border-transparent shadow-sm'
              : 'hover:text-foreground',
          )}
        >
          {FILTER_LABELS[key]}
        </Link>
      );
    })}
  </nav>
);
