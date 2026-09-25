import { ArrowUpRight, Bot, FileText, MessageSquare } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCount, relativeTime } from '@/lib/format';

export type AssistantCardData = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  pagesIndexed: number;
  conversationsLast30Days: number;
};

const plural = (value: number, singular: string) => (value === 1 ? singular : `${singular}s`);

export const AssistantCard = ({ assistant }: { assistant: AssistantCardData }) => (
  <Card className="group/assistant hover:ring-foreground/20 relative transition-shadow">
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
      {/* Top-aligned so both numbers share a line even when one label wraps to two. */}
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-start gap-2">
          <FileText className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col">
            <dd className="font-medium tabular-nums">{formatCount(assistant.pagesIndexed)}</dd>
            <dt className="text-muted-foreground text-xs">
              {plural(assistant.pagesIndexed, 'page')} indexed
            </dt>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <MessageSquare className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col">
            <dd className="font-medium tabular-nums">
              {formatCount(assistant.conversationsLast30Days)}
            </dd>
            <dt className="text-muted-foreground text-xs">
              {plural(assistant.conversationsLast30Days, 'conversation')} in 30 days
            </dt>
          </div>
        </div>
      </dl>
      <p className="text-muted-foreground text-xs">
        Created{' '}
        <time dateTime={assistant.createdAt} suppressHydrationWarning>
          {relativeTime(assistant.createdAt)}
        </time>
      </p>
    </CardContent>
  </Card>
);
