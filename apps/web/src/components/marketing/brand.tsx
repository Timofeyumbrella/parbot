import { cn } from 'cn';
import { Bot } from 'lucide-react';
import Link from 'next/link';

/** The wordmark used on marketing pages. Links home rather than to the dashboard. */
export const Brand = ({ className }: { className?: string }) => (
  <Link
    href="/"
    className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}
    aria-label="Parbot home"
  >
    <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
      <Bot className="size-4" aria-hidden="true" />
    </span>
    Parbot
  </Link>
);
