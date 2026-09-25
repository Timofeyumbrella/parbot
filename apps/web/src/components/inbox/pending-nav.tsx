'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useState, useTransition } from 'react';

type PendingNavValue = {
  /** True while a search-param navigation started here is waiting for the server. */
  pending: boolean;
  /** The href that was clicked, so the clicked pill can light up before the URL changes. */
  target: string | null;
  navigate: (href: string) => void;
};

const PendingNavContext = createContext<PendingNavValue>({
  pending: false,
  target: null,
  navigate: () => {},
});

/**
 * Search-param navigations (period, tab, filter) re-render the same page, so `loading.tsx`
 * never shows and a plain link gives no feedback until the server answers. This provider
 * runs those navigations inside a transition and shares the pending state: the clicked pill
 * moves at once and the region below dims until the new content arrives.
 */
export const PendingNav = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<string | null>(null);

  const navigate = (href: string) => {
    setTarget(href);
    startTransition(() => {
      // The switch sits at the top of the page; keep the scroll position instead of jumping.
      router.push(href, { scroll: false });
    });
  };

  return (
    <PendingNavContext.Provider value={{ pending, target, navigate }}>
      {children}
    </PendingNavContext.Provider>
  );
};

export const usePendingNav = () => useContext(PendingNavContext);

/** Wraps the content a switch replaces; it dims and blocks clicks while the switch is pending. */
export const PendingRegion = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const { pending } = usePendingNav();

  return (
    <div
      aria-busy={pending || undefined}
      data-pending={pending ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-6 transition-opacity duration-150',
        pending && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {children}
    </div>
  );
};

const isPlainLeftClick = (event: React.MouseEvent<HTMLAnchorElement>) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

type SegmentedLinkProps = {
  href: string;
  active: boolean;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
};

/**
 * A link in a switch. It stays a real link (open in a new tab works), but a plain click runs
 * through the pending navigation so the pill moves before the server responds.
 */
export const SegmentedLink = ({
  href,
  active,
  children,
  className,
  activeClassName,
  inactiveClassName,
}: SegmentedLinkProps) => {
  const { pending, target, navigate } = usePendingNav();
  const current = pending && target ? target === href : active;

  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      onClick={(event) => {
        if (!isPlainLeftClick(event)) {
          return;
        }

        event.preventDefault();
        navigate(href);
      }}
      className={cn(className, current ? activeClassName : inactiveClassName)}
    >
      {children}
    </Link>
  );
};

/** The shared look of a compact pill switch (period, filter). */
export const pillNavClass =
  'bg-muted text-muted-foreground inline-flex h-8 w-fit max-w-full items-center rounded-lg p-[3px]';
export const pillLinkClass =
  'inline-flex h-full items-center rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors';
export const pillActiveClass =
  'bg-background text-foreground dark:bg-input/30 dark:border-input border border-transparent shadow-sm';
export const pillInactiveClass = 'hover:text-foreground';
