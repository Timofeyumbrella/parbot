import { ArrowUpRight, Bot, FileText, MessageSquare } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export type AssistantCardData = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  pagesIndexed: number;
  conversationsLast30Days: number;
};

const DAY_MS = 86_400_000;

/** "today", "3 days ago", "2 months ago": enough precision for a card. */
export const timeAgo = (iso: string, now = Date.now()) => {
  const elapsed = now - new Date(iso).getTime();
  const days = Math.floor(elapsed / DAY_MS);
  const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (days < 1) {
    return relative.format(0, 'day');
  }

  if (days < 30) {
    return relative.format(-days, 'day');
  }

  if (days < 365) {
    return relative.format(-Math.floor(days / 30), 'month');
  }

  return relative.format(-Math.floor(days / 365), 'year');
};

const plural = (value: number, singular: string) => (value === 1 ? singular : `${singular}s`);

export const AssistantCard = ({ assistant }: { assistant: AssistantCardData }) => (
  <Card className="group/assistant relative transition-shadow hover:ring-foreground/20">
    <CardHeader>
      <div className="flex items-start gap-3">
        <span className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Bot className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <CardTitle className="truncate">
            <Link href={`/a/${assistant.id}`} prefetch className="after:absolute after:inset-0">
              {assistant.name}
            </Link>
          </CardTitle>
          <CardDescription className="truncate font-mono text-xs">{assistant.slug}</CardDescription>
        </div>
        <ArrowUpRight className="text-muted-foreground ml-auto size-4 shrink-0 opacity-0 transition-opacity group-hover/assistant:opacity-100" />
      </div>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <FileText className="text-muted-foreground size-4 shrink-0" />
          <div className="flex flex-col">
            <dd className="font-medium tabular-nums">{assistant.pagesIndexed.toLocaleString('en-US')}</dd>
            <dt className="text-muted-foreground text-xs">{plural(assistant.pagesIndexed, 'page')} indexed</dt>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MessageSquare className="text-muted-foreground size-4 shrink-0" />
          <div className="flex flex-col">
            <dd className="font-medium tabular-nums">{assistant.conversationsLast30Days.toLocaleString('en-US')}</dd>
            <dt className="text-muted-foreground text-xs">
              {plural(assistant.conversationsLast30Days, 'conversation')} in 30 days
            </dt>
          </div>
        </div>
      </dl>
      <p className="text-muted-foreground text-xs">Created {timeAgo(assistant.createdAt)}</p>
    </CardContent>
  </Card>
);
