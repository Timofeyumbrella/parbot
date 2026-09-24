import { cn } from 'cn';
import { Globe, MessageSquare } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { Enums } from '@/lib/db';

export type Channel = Enums<'chat_channel'>;

export const channelLabel = (channel: Channel) => (channel === 'widget' ? 'Widget' : 'In-app');

/** Where a conversation came from: the embedded widget or the chat inside the app. */
export const ChannelBadge = ({ channel, className }: { channel: Channel; className?: string }) => (
  <Badge
    variant={channel === 'widget' ? 'outline' : 'secondary'}
    className={cn('gap-1 font-normal', className)}
    data-channel={channel}
  >
    {channel === 'widget' ? <Globe aria-hidden="true" /> : <MessageSquare aria-hidden="true" />}
    {channelLabel(channel)}
  </Badge>
);

/** A small amber mark for conversations the docs could not answer. */
export const UnansweredDot = ({ className, label = 'Has unanswered questions' }: { className?: string; label?: string }) => (
  <span
    role="img"
    aria-label={label}
    title={label}
    className={cn('bg-warning inline-block size-2 shrink-0 rounded-full', className)}
  />
);

export const UnansweredBadge = ({ count, className }: { count?: number; className?: string }) => (
  <Badge
    variant="outline"
    className={cn('border-warning/40 bg-warning/10 text-foreground gap-1.5 font-normal', className)}
  >
    <span aria-hidden="true" className="bg-warning size-1.5 rounded-full" />
    {count && count > 1 ? `${count} unanswered` : 'Unanswered'}
  </Badge>
);
