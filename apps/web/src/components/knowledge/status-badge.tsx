'use client';

import { cn } from 'cn';
import { CircleAlert, CircleCheck, Clock, LoaderCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Source } from '@/lib/db';
import { formatCount } from '@/lib/format';

import { plural } from './format';

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
        <Badge variant="outline" className={cn('border-success/30 bg-success/10 text-success', className)}>
          <CircleCheck aria-hidden="true" />
          Ready
        </Badge>
      );
    case 'failed':
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
