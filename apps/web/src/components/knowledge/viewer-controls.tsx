'use client';

import { ArrowLeft, LocateFixed } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { PASSAGE_ANCHOR } from '@/lib/knowledge/passage';

/**
 * Whether the previous history entry is a screen of this app: the viewer was reached by a click
 * inside the app (the document the tab loaded is another page), or loaded from one of its pages.
 */
const previousIsInApp = () => {
  if (window.history.length < 2) {
    return false;
  }

  const [loaded] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];

  if (loaded && loaded.name !== window.location.href) {
    return true;
  }

  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
};

/**
 * Back to wherever the reader came from: the chat, the Inbox or Knowledge. A page opened on its
 * own (a new tab, a pasted link) has nowhere in the app to go back to, so it goes to Knowledge.
 */
export const ViewerBack = ({ fallback }: { fallback: string }) => {
  const router = useRouter();

  return (
    <Button asChild variant="ghost" size="sm" className="text-muted-foreground -ml-2 w-fit">
      <Link
        href={fallback}
        onClick={(event) => {
          if (previousIsInApp()) {
            event.preventDefault();
            router.back();
          }
        }}
      >
        <ArrowLeft data-icon="inline-start" aria-hidden="true" />
        Back
      </Link>
    </Button>
  );
};

const scrollToPassage = (behavior: ScrollBehavior) =>
  document.getElementById(PASSAGE_ANCHOR)?.scrollIntoView({ block: 'center', behavior });

/** Brings the highlighted passage into view when the page opens, and again on request. */
export const PassageJump = () => {
  useEffect(() => {
    scrollToPassage('auto');
  }, []);

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="shrink-0"
      onClick={() => scrollToPassage('smooth')}
    >
      <LocateFixed data-icon="inline-start" aria-hidden="true" />
      Show passage
    </Button>
  );
};
