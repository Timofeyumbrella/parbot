import { Code2, MessageSquare } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Shown until the assistant has answered its first message: the two ways to get traffic. */
export const FirstUse = ({ assistantId, assistantName }: { assistantId: string; assistantName: string }) => (
  <Card data-testid="first-use">
    <CardHeader>
      <CardTitle>No conversations yet</CardTitle>
      <CardDescription>
        {assistantName} has not answered anything so far. Stats appear here as soon as someone asks a question, and
        there are two ways to make that happen.
      </CardDescription>
    </CardHeader>
    <CardContent className="grid gap-3 sm:grid-cols-2">
      <div className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex items-center gap-2 font-medium">
          <MessageSquare aria-hidden="true" className="text-muted-foreground size-4" />
          Test it in Chat
        </div>
        <p className="text-muted-foreground text-sm">
          Ask the assistant something your docs cover and see how it answers, with the sources it used.
        </p>
        <Button asChild size="sm" className="mt-auto w-fit">
          <Link href={`/a/${assistantId}/chat`} prefetch>
            Open Chat
          </Link>
        </Button>
      </div>
      <div className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex items-center gap-2 font-medium">
          <Code2 aria-hidden="true" className="text-muted-foreground size-4" />
          Install the widget
        </div>
        <p className="text-muted-foreground text-sm">
          Drop one script tag on your docs site and visitors can ask there. Their questions land in this inbox.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-auto w-fit">
          <Link href={`/a/${assistantId}/widget`} prefetch>
            Get the embed code
          </Link>
        </Button>
      </div>
    </CardContent>
  </Card>
);
