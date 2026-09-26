'use client';

import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from 'cn';
import { MessageSquare } from 'lucide-react';
import Link, { useLinkStatus } from 'next/link';
import { useEffect, useState } from 'react';

import { ChannelBadge, UnansweredBadge } from '@/components/inbox/channel-badge';
import {
  activityStamp,
  compareActivity,
  conversationListKey,
  conversationPage,
  type ConversationPage,
  type ConversationRow,
  inboxCountsKey,
  type InboxCounts,
  matchesFilter,
  type PageCursor,
  pageOf,
} from '@/components/inbox/conversation-query';
import { LocalTime } from '@/components/inbox/local-time';
import { Button } from '@/components/ui/button';
import { type ConversationFilter, hostnameOf } from '@/lib/analytics';
import { formatCount } from '@/lib/format';
import { getSupabaseBrowserClient, realtimeReadyClient } from '@/lib/supabase/client';

export type ListData = InfiniteData<ConversationPage, PageCursor | null>;

const fetchPage = async (
  assistantId: string,
  filter: ConversationFilter,
  cursor: PageCursor | null,
): Promise<ConversationPage> => {
  const { data, error } = await conversationPage(
    getSupabaseBrowserClient(),
    assistantId,
    filter,
    cursor,
  );

  if (error) {
    throw new Error(error.message);
  }

  return pageOf(data ?? []);
};

/** Applies one Realtime change to the cached pages. Returns the same object when nothing applies. */
export const applyChange = (
  data: ListData,
  payload: RealtimePostgresChangesPayload<ConversationRow>,
  filter: ConversationFilter,
): { data: ListData; added: string | null } => {
  if (payload.eventType === 'DELETE') {
    const id = payload.old.id;

    if (!id || !data.pages.some((page) => page.rows.some((row) => row.id === id))) {
      return { data, added: null };
    }

    return {
      data: {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          rows: page.rows.filter((row) => row.id !== id),
        })),
      },
      added: null,
    };
  }

  const row = payload.new;
  const known = data.pages.some((page) => page.rows.some((existing) => existing.id === row.id));
  const fits = matchesFilter(row, filter);

  if (known) {
    return {
      data: {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          rows: fits
            ? page.rows.map((existing) =>
                existing.id === row.id ? { ...existing, ...row } : existing,
              )
            : page.rows.filter((existing) => existing.id !== row.id),
        })),
      },
      added: null,
    };
  }

  if (!fits) {
    return { data, added: null };
  }

  // A row that sorts past the last loaded one belongs to a page "Load more" has not fetched yet,
  // and that page brings it in its place. Shown now, it would sit below the loaded rows until
  // the page arrived and slotted its own rows in above it. This also covers an event that
  // Realtime delivers late, for a change made before the list subscribed.
  const cursor = data.pages[data.pages.length - 1]?.cursor;

  if (cursor && compareActivity(row, { last_message_at: cursor.at, id: cursor.id }) > 0) {
    return { data, added: null };
  }

  const [first, ...rest] = data.pages;

  return {
    data: {
      ...data,
      pages: [{ ...(first ?? { cursor: null }), rows: [row, ...(first?.rows ?? [])] }, ...rest],
    },
    added: row.id,
  };
};

export type ConversationListProps = {
  assistantId: string;
  filter: ConversationFilter;
  /** The first page as the server read it, one row over the page size when more exist. */
  initialRows: ConversationRow[];
  /** The request's clock, shared by every relative time on the page. */
  now: number;
};

/**
 * Marks a row the moment it is clicked while the router still waits for a route it has not
 * prefetched (the first seconds after the inbox loads, with dozens of rows queued for prefetch).
 * The row's own classes style it through `has-data-pending`.
 */
const RowPending = () => {
  const { pending } = useLinkStatus();

  return pending ? <span aria-hidden="true" data-pending="" className="hidden" /> : null;
};

const EMPTY_COPY: Record<ConversationFilter, { title: string; body: string }> = {
  all: {
    title: 'No conversations yet',
    body: 'Ask a question in Chat to test the assistant, or install the widget so visitors can ask on your docs site.',
  },
  widget: {
    title: 'No widget conversations yet',
    body: 'Install the widget on your docs site and questions asked there will show up here.',
  },
  app: {
    title: 'No in-app conversations yet',
    body: 'Open Chat and ask the assistant something. Every thread you start lands here.',
  },
  unanswered: {
    title: 'Nothing unanswered',
    body: 'Every question in this inbox got an answer from the docs.',
  },
};

/**
 * The conversation rows for one filter. The first page comes from the server; more pages load
 * through the browser client by keyset, and Realtime keeps the list current while it is open.
 */
export const ConversationList = ({
  assistantId,
  filter,
  initialRows,
  now,
}: ConversationListProps) => {
  const queryClient = useQueryClient();
  const key = conversationListKey(assistantId, filter);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());

  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchPage(assistantId, filter, pageParam),
    initialPageParam: null as PageCursor | null,
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialData: { pages: [pageOf(initialRows)], pageParams: [null] },
    initialDataUpdatedAt: now,
  });

  // A cached list from an earlier visit must not outrank the page the server just rendered:
  // whatever is in the cache from before this request is replaced by the fresh first page.
  useEffect(() => {
    const state = queryClient.getQueryState<ListData>(key);

    if (state && state.dataUpdatedAt < now) {
      queryClient.setQueryData<ListData>(
        key,
        { pages: [pageOf(initialRows)], pageParams: [null] },
        { updatedAt: now },
      );
    }
    // The key is derived from these two; the rows belong to the same server render as `now`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantId, filter, now, queryClient]);

  // The page mounts one list per filter, so the subscription simply closes over this filter.
  useEffect(() => {
    const currentKey = conversationListKey(assistantId, filter);
    const countsKey = inboxCountsKey(assistantId);
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    const subscribe = async () => {
      const supabase = await realtimeReadyClient();

      if (cancelled) {
        return;
      }

      channel = supabase
        .channel(`inbox:${assistantId}:${filter}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversations',
            filter: `assistant_id=eq.${assistantId}`,
          },
          (payload: RealtimePostgresChangesPayload<ConversationRow>) => {
            const current = queryClient.getQueryData<ListData>(currentKey);

            if (!current) {
              return;
            }

            const { data, added } = applyChange(current, payload, filter);

            if (data !== current) {
              queryClient.setQueryData<ListData>(currentKey, data);
            }

            if (added) {
              setFresh((marked) => new Set(marked).add(added));
            }

            // The tab label counts every conversation, whichever filter is open.
            if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
              const delta = payload.eventType === 'INSERT' ? 1 : -1;

              queryClient.setQueryData<InboxCounts>(countsKey, (counts) =>
                counts
                  ? { ...counts, conversations: Math.max(counts.conversations + delta, 0) }
                  : counts,
              );
            }
          },
        )
        .subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`Inbox realtime channel ${status}`, error);
          }
        });
    };

    void subscribe();

    return () => {
      cancelled = true;

      if (channel) {
        void getSupabaseBrowserClient().removeChannel(channel);
      }
    };
  }, [assistantId, filter, queryClient]);

  const seen = new Set<string>();
  const rows = query.data.pages
    .flatMap((page) => page.rows)
    .filter((row) => {
      if (seen.has(row.id)) {
        return false;
      }

      seen.add(row.id);

      return true;
    })
    // Live updates change a row's last message in place; put it back where the server pages it.
    .sort(compareActivity);

  if (rows.length === 0) {
    const copy = EMPTY_COPY[filter];

    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
        <MessageSquare aria-hidden="true" className="text-muted-foreground size-5" />
        <p className="font-medium">{copy.title}</p>
        <p className="text-muted-foreground max-w-md text-sm">{copy.body}</p>
        {filter === 'all' || filter === 'app' ? (
          <div className="mt-2 flex gap-2">
            <Button asChild size="sm">
              <Link href={`/a/${assistantId}/chat`}>Open Chat</Link>
            </Button>
            {filter === 'all' ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/a/${assistantId}/widget`}>Install the widget</Link>
              </Button>
            ) : null}
          </div>
        ) : filter === 'widget' ? (
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link href={`/a/${assistantId}/widget`}>Install the widget</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y overflow-hidden rounded-lg border" data-testid="conversation-list">
        {rows.map((row) => {
          const host = row.channel === 'widget' ? hostnameOf(row.page_url) : null;
          const isNew = fresh.has(row.id);

          return (
            <li key={row.id} data-conversation-id={row.id} data-new={isNew ? 'true' : undefined}>
              <Link
                href={`/a/${assistantId}/inbox/${row.id}`}
                className={cn(
                  'hover:bg-muted/60 has-data-pending:bg-muted has-data-pending:animate-pulse flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                  isNew && 'bg-primary/5',
                )}
              >
                <RowPending />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    {isNew ? (
                      <span className="text-primary inline-flex shrink-0 items-center gap-1 text-[11px] font-medium uppercase tracking-wide">
                        <span aria-hidden="true" className="bg-primary size-1.5 rounded-full" />
                        New
                      </span>
                    ) : null}
                    <span className="truncate font-medium" title={row.title ?? undefined}>
                      {row.title || (
                        <span className="text-muted-foreground font-normal">Untitled</span>
                      )}
                    </span>
                  </div>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <ChannelBadge channel={row.channel} />
                    {host ? (
                      <span className="truncate" title={row.page_url ?? undefined}>
                        {host}
                      </span>
                    ) : null}
                    <span className="tabular-nums">
                      {formatCount(row.message_count)}{' '}
                      {row.message_count === 1 ? 'message' : 'messages'}
                    </span>
                    {row.unanswered_count > 0 ? (
                      <UnansweredBadge count={row.unanswered_count} />
                    ) : null}
                  </div>
                </div>
                <LocalTime
                  value={activityStamp(row)}
                  now={now}
                  className="text-muted-foreground min-w-16 shrink-0 whitespace-nowrap text-right text-xs"
                />
              </Link>
            </li>
          );
        })}
      </ul>

      {query.isError ? (
        <p role="alert" className="text-destructive text-sm">
          More conversations could not be loaded. Check your connection and try again.
        </p>
      ) : null}

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? 'Loading' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
