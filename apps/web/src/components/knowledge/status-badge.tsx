'use client';

import { cn } from 'cn';
import { CircleAlert, CircleCheck, CirclePause, Clock, LoaderCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Source } from '@/lib/db';
import { formatCount } from '@/lib/format';
import { pausedUntil } from '@/lib/knowledge/indexing-paused';

import { plural } from './format';
import { SourceErrorText } from './source-error-text';

type StatusBadgeProps = {
  source: Pick<Source, 'status' | 'pages_found' | 'pages_done' | 'error'>;
  className?: string;
};

/** Where a source is in the pipeline, in one glance. A failure carries its reason on hover. */
export const StatusBadge = ({ source, className }: StatusBadgeProps) => {
  switch (source.status) {
    case 'queued':
      return (
        <Badge variant="secondary" className={className}>
          <Clock aria-hidden="true" />
          Queued
        </Badge>
      );
    case 'crawling':
      return (
        <Badge variant="outline" className={className}>
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          Crawling{source.pages_found > 0 ? ` · ${plural(source.pages_found, 'page')}` : ''}
        </Badge>
      );
    case 'indexing':
      return (
        <Badge variant="outline" className={className}>
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          Indexing {formatCount(source.pages_done)} of {plural(source.pages_found, 'page')}
        </Badge>
      );
    case 'ready':
      return (
        <Badge
          variant="outline"
          className={cn('border-success/30 bg-success/10 text-success', className)}
        >
          <CircleCheck aria-hidden="true" />
          Ready
        </Badge>
      );
    case 'failed':
      // Nothing is broken: the provider's daily limit stopped the run, and it resets on its own.
      if (pausedUntil(source.error)) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={cn(
                  'border-warning/30 bg-warning/10 text-warning cursor-help',
                  className,
                )}
                tabIndex={0}
              >
                <CirclePause aria-hidden="true" />
                Paused
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-sm whitespace-pre-wrap">
              <SourceErrorText error={source.error!} />
            </TooltipContent>
          </Tooltip>
        );
      }

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className={cn('cursor-help', className)} tabIndex={0}>
              <CircleAlert aria-hidden="true" />
              Failed
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-sm whitespace-pre-wrap">
            {source.error ?? 'Indexing failed. Try again.'}
          </TooltipContent>
        </Tooltip>
      );
  }
};
