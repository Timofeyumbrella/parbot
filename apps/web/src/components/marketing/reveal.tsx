'use client';

import { cn } from 'cn';
import { useEffect, useRef } from 'react';

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Milliseconds to wait after entering the viewport, for staggering siblings. */
  delay?: number;
};

const HIDDEN = ['opacity-0', 'translate-y-4'];

/**
 * Fades and rises its content the first time it scrolls into view. Content renders visible on
 * the server and is only hidden once JavaScript confirms it is below the fold, so nothing
 * flashes and nothing is lost without a script or with reduced motion.
 */
export const Reveal = ({ children, className, delay = 0 }: RevealProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;

    if (!element || typeof IntersectionObserver === 'undefined') {
      return;
    }

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    if (element.getBoundingClientRect().top < window.innerHeight * 0.92) {
      return;
    }

    element.classList.add(...HIDDEN);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          element.classList.remove(...HIDDEN);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn('transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
};
