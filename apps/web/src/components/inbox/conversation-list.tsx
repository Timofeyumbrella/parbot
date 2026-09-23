'use client';

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from 'cn';
import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { ChannelBadge, UnansweredBadge } from '@/components/inbox/channel-badge';
import { Button } from '@/components/ui/button';
import { absoluteTime, type ConversationFilter, formatCount, hostnameOf, relativeTime } from '@/lib/analytics';
import type { Conversation } from '@/lib/db';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export const CONVERSATION_COLUMNS =
  'id, title, channel, page_url, message_count, unanswered_count, last_message_at, created_at' as const;

export type ConversationRow = Pick<
  Conversation,
  'id' | 'title' | 'channel' | 'page_url' | 'message_count' | 'unanswered_count' | 'last_message_at' | 'created_at'
>;

export const PAGE_SIZE = 30;

type Page = { rows: ConversationRow[]; cursor: string | null };

const matchesFilter = (row: ConversationRow, filter: ConversationFilter) => {
  switch (filter) {
    case 'widget':
      return row.channel === 'widget';
    case 'app':
      return row.channel === 'app';
    case 'unanswered':
      return row.unanswered_count > 0;
    default:
      return true;
  }
};

/** The cursor for the next page: rows without a message sit last, so a null cursor ends paging. */
export const nextCursor = (rows: ConversationRow[]) =>
  rows.length === PAGE_SIZE ? (rows[rows.length - 1]?.last_message_at ?? null) : null;

const listKey = (assistantId: string, filter: ConversationFilter) => ['conversations', assistantId, filter] as const;

const CLOCK_MS = 30_000;

const subscribeClock = (notify: () => void) => {
  const timer = setInterval(notify, CLOCK_MS);

  return () => clearInterval(timer);
};

const clockSnapshot = () => Math.floor(Date.now() / CLOCK_MS) * CLOCK_MS;

/**
 * The reference time for "5m ago". Hydration uses the server's value so both renders agree,
 * then the client ticks forward in half-minute steps.
 */
const useNow = (initial: number) => useSyncExternalStore(subscribeClock, clockSnapshot, () => initial);

const fetchPage = async (assistantId: string, filter: ConversationFilter, cursor: string | null): Promise<Page> => {
  let query = getSupabaseBrowserClient()
    .from('conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('assistant_id', assistantId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (filter === 'widget' || filter === 'app') {
    query = query.eq('channel', filter);
  } else if (filter === 'unanswered') {
    query = query.gt('unanswered_count', 0);
  }

  if (cursor) {
    query = query.lt('last_message_at', cursor);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return { rows: data ?? [], cursor: nextCursor(data ?? []) };
};

export type ConversationListProps = {
  assistantId: string;
  filter: ConversationFilter;
  initialRows: ConversationRow[];
  now: number;
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
export const ConversationList = ({ assistantId, filter, initialRows, now: initialNow }: ConversationListProps) => {
  const queryClient = useQueryClient();
  const key = listKey(assistantId, filter);
  const now = useNow(initialNow);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());

  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchPage(assistantId, filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialData: { pages: [{ rows: initialRows, cursor: nextCursor(initialRows) }], pageParams: [null] },
    initialDataUpdatedAt: initialNow,
  });

  // The page mounts one list per filter, so the subscription simply closes over this filter.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const currentKey = listKey(assistantId, filter);
    const channel = supabase
      .channel(`inbox:${assistantId}:${filter}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `assistant_id=eq.${assistantId}` },
        (payload: RealtimePostgresChangesPayload<ConversationRow>) => {
          if (payload.eventType === 'DELETE') {
            const id = payload.old.id;

            if (!id) {
              return;
            }

            queryClient.setQueryData<{ pages: Page[]; pageParams: (string | null)[] }>(currentKey, (data) =>
              data
                ? { ...data, pages: data.pages.map((page) => ({ ...page, rows: page.rows.filter((row) => row.id !== id) })) }
                : data,
            );

            return;
          }

          const row = payload.new;

          queryClient.setQueryData<{ pages: Page[]; pageParams: (string | null)[] }>(currentKey, (data) => {
            if (!data) {
              return data;
            }

            const known = data.pages.some((page) => page.rows.some((existing) => existing.id === row.id));
            const fits = matchesFilter(row, filter);

            if (known) {
              return {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  rows: fits
                    ? page.rows.map((existing) => (existing.id === row.id ? { ...existing, ...row } : existing))
                    : page.rows.filter((existing) => existing.id !== row.id),
                })),
              };
            }

            if (!fits) {
              return data;
            }

            setFresh((current) => new Set(current).add(row.id));

            const [first, ...rest] = data.pages;

            return {
              ...data,
              pages: [{ ...(first ?? { cursor: null }), rows: [row, ...(first?.rows ?? [])] }, ...rest],
            };
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [assistantId, filter, queryClient]);

  const seen = new Set<string>();
  const rows = query.data.pages.flatMap((page) => page.rows).filter((row) => {
    if (seen.has(row.id)) {
      return false;
    }

    seen.add(row.id);

    return true;
  });

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
              <Link href={`/a/${assistantId}/chat`} prefetch>
                Open Chat
              </Link>
            </Button>
            {filter === 'all' ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/a/${assistantId}/widget`} prefetch>
                  Install the widget
                </Link>
              </Button>
            ) : null}
          </div>
        ) : filter === 'widget' ? (
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link href={`/a/${assistantId}/widget`} prefetch>
              Install the widget
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y overflow-hidden rounded-lg border" data-testid="conversation-list">
        {rows.map((row) => {
          const stamp = row.last_message_at ?? row.created_at;
          const host = row.channel === 'widget' ? hostnameOf(row.page_url) : null;
          const isNew = fresh.has(row.id);

          return (
            <li key={row.id} data-conversation-id={row.id} data-new={isNew ? 'true' : undefined}>
              <Link
                href={`/a/${assistantId}/inbox/${row.id}`}
                prefetch
                className={cn(
                  'hover:bg-muted/60 flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                  isNew && 'bg-primary/5',
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    {isNew ? (
                      <span className="text-primary inline-flex shrink-0 items-center gap-1 text-[11px] font-medium uppercase tracking-wide">
                        <span aria-hidden="true" className="bg-primary size-1.5 rounded-full" />
                        New
                      </span>
                    ) : null}
                    <span className="truncate font-medium" title={row.title ?? undefined}>
                      {row.title || <span className="text-muted-foreground font-normal">Untitled</span>}
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
                      {formatCount(row.message_count)} {row.message_count === 1 ? 'message' : 'messages'}
                    </span>
                    {row.unanswered_count > 0 ? <UnansweredBadge count={row.unanswered_count} /> : null}
                  </div>
                </div>
                <time
                  dateTime={stamp}
                  title={absoluteTime(stamp)}
                  className="text-muted-foreground w-16 shrink-0 text-right text-xs"
                >
                  {relativeTime(stamp, now)}
                </time>
              </Link>
            </li>
          );
        })}
      </ul>

      {query.isError ? (
        <p role="alert" className="text-destructive text-sm">
          More conversations could not be loaded: {query.error.message}. Try again.
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
