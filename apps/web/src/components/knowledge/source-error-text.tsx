'use client';

import { useHydrated } from '@/hooks/use-hydrated';
import { sourceErrorText } from '@/lib/knowledge/indexing-paused';

/**
 * A source's error as stored, except that a run paused by the daily limit names its reset on the
 * reader's clock. The server cannot know that clock, so the first render says "in about N hours"
 * and the one after hydration the time; the hours can tip over between the two renders.
 */
export const SourceErrorText = ({ error, className }: { error: string; className?: string }) => {
  const hydrated = useHydrated();

  return (
    <span className={className} suppressHydrationWarning>
      {sourceErrorText(error, { local: hydrated })}
    </span>
  );
};
