import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { ChannelBadge, UnansweredDot } from '@/components/inbox/channel-badge';
import { LocalTime } from '@/components/inbox/local-time';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Conversation } from '@/lib/db';

export type RecentConversation = Pick<
  Conversation,
  'id' | 'title' | 'channel' | 'last_message_at' | 'created_at' | 'unanswered_count'
>;

export const RecentConversations = ({
  rows,
  now,
  assistantId,
}: {
  rows: RecentConversation[];
  now: number;
  assistantId: string;
}) => (
  <Card className="gap-0" data-testid="recent-conversations">
    <CardHeader className="border-b pb-(--card-spacing)">
      <CardTitle>Recent conversations</CardTitle>
      <CardDescription>From the widget and from Chat, newest first.</CardDescription>
      <CardAction>
        <Link
          href={`/a/${assistantId}/inbox`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
        >
          Open inbox
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </CardAction>
    </CardHeader>
    <CardContent className="p-0">
      {rows.length === 0 ? (
        <p className="text-muted-foreground px-(--card-spacing) py-8 text-center text-sm">No conversations yet.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id} className="border-b last:border-0">
              <Link
                href={`/a/${assistantId}/inbox/${row.id}`}
                className="hover:bg-muted/60 flex items-center gap-3 px-(--card-spacing) py-2 text-sm transition-colors"
              >
                {row.unanswered_count > 0 ? (
                  <UnansweredDot />
                ) : (
                  <span aria-hidden="true" className="inline-block size-2 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate" title={row.title ?? undefined}>
                  {row.title || <span className="text-muted-foreground">Untitled</span>}
                </span>
                <ChannelBadge channel={row.channel} />
                <LocalTime
                  value={row.last_message_at ?? row.created_at}
                  now={now}
                  className="text-muted-foreground w-16 shrink-0 text-right text-xs"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);
