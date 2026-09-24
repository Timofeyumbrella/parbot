'use client';

import type { WidgetMode } from '@parbot/shared';
import { cn } from 'cn';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type WidgetPreviewProps = {
  demoPath: string;
  demoUrl: string;
  mode: WidgetMode;
  /**
   * Bumped after every successful save. The frame reloads with it, and the demo page passes it
   * to the widget, whose config request then skips every cache, so the save shows at once.
   */
  version: number;
  hasSources: boolean;
  knowledgeHref: string;
};

const PreviewFrame = ({ src }: { src: string }) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative">
      {loaded ? null : <Skeleton className="absolute inset-0 rounded-lg" />}
      <iframe
        src={src}
        title="Widget preview"
        onLoad={() => setLoaded(true)}
        className={cn('bg-background h-[620px] w-full rounded-lg border', !loaded && 'opacity-0')}
      />
    </div>
  );
};

export const WidgetPreview = ({ demoPath, demoUrl, mode, version, hasSources, knowledgeHref }: WidgetPreviewProps) => (
  <Card size="sm">
    <CardHeader>
      <CardTitle>Live preview</CardTitle>
      <CardDescription>The public demo page with your saved settings, opened. It reloads after every save.</CardDescription>
      <CardAction>
        <Button asChild variant="outline" size="sm">
          <a href={demoUrl} target="_blank" rel="noopener noreferrer">
            Open the demo page
            <ExternalLink />
          </a>
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      {hasSources ? null : (
        <p className="bg-muted text-muted-foreground rounded-lg p-3 text-sm">
          No sources are indexed yet, so the assistant will say it cannot find an answer.{' '}
          <Link href={knowledgeHref} className="text-foreground underline underline-offset-4">
            Add sources under Knowledge
          </Link>
          .
        </p>
      )}
      <PreviewFrame key={version} src={`${demoPath}?mode=${mode}&v=${version}&open=1`} />
    </CardContent>
  </Card>
);
