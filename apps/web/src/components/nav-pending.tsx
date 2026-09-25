'use client';

import { cn } from 'cn';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type NavPendingValue = {
  /** The href a sidebar click is taking the reader to, until the pathname moves. */
  href: string | null;
  start: (href: string) => void;
};

const NavPendingContext = createContext<NavPendingValue>({ href: null, start: () => {} });

/** A click the browser leaves to the page: no new tab, no download, no other button. */
export const isPlainLeftClick = (event: React.MouseEvent<HTMLAnchorElement>) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * Feedback for the dashboard's own navigation that does not depend on the router cache. Next can
 * show a route's loading.tsx at once only after it has prefetched that route; in the first second
 * or two after a full load, or after a server action purged the cache, a click would otherwise
 * wait a whole round trip with nothing on screen changing. The clicked item takes the highlight
 * and the page dims in the click frame, and both end as soon as the pathname moves.
 */
export const NavPendingProvider = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const [href, setHref] = useState<string | null>(null);
  const [seen, setSeen] = useState(pathname);

  // Arriving, or going anywhere else (a back button included), ends the pending click.
  if (seen !== pathname) {
    setSeen(pathname);
    setHref(null);
  }

  const start = useCallback(
    (next: string) => {
      setHref(next === pathname ? null : next);
    },
    [pathname],
  );

  const value = useMemo(() => ({ href, start }), [href, start]);

  return <NavPendingContext.Provider value={value}>{children}</NavPendingContext.Provider>;
};

export const useNavPending = () => useContext(NavPendingContext);

/**
 * The page area. It dims while a sidebar navigation waits for the server; the delay keeps a
 * navigation that lands at once from flashing, and the way back is instant.
 */
export const PendingMain = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const { href } = useNavPending();

  return (
    <main
      aria-busy={href ? true : undefined}
      data-pending={href ? 'true' : undefined}
      className={cn(className, href && 'opacity-60 transition-opacity delay-100 duration-150')}
    >
      {children}
    </main>
  );
};
