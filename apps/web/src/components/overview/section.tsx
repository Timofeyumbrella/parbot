import { cn } from 'cn';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCount } from '@/lib/format';

export type SectionProps = {
  title: string;
  /** One line on why the section matters to someone who owns the docs. */
  why: string;
  /** A count beside the title, such as how many gaps there are. */
  count?: number;
  /** The section's primary action, top right. */
  action?: React.ReactNode;
  /** The next step, as a line under the content. */
  footer?: React.ReactNode;
  testId: string;
  className?: string;
  children: React.ReactNode;
};

/** One Overview section: what it shows, why it matters, the data, and what to do about it. */
export const Section = ({
  title,
  why,
  count,
  action,
  footer,
  testId,
  className,
  children,
}: SectionProps) => {
  // Each section appears once per page, so its test id makes a stable heading id.
  const headingId = `${testId}-title`;

  return (
    <Card
      className={cn('gap-0', className)}
      data-testid={testId}
      role="region"
      aria-labelledby={headingId}
    >
      <CardHeader className="pb-(--card-spacing) border-b">
        <CardTitle>
          <h2 id={headingId} className="flex items-center gap-2">
            {title}
            {count !== undefined ? (
              <span
                className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums"
                data-testid="section-count"
              >
                {formatCount(count)}
              </span>
            ) : null}
          </h2>
        </CardTitle>
        <CardDescription>{why}</CardDescription>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <div className="flex flex-1 flex-col">{children}</div>
      {footer ? (
        // The card drops its bottom padding when it has a footer slot, so the strip sits flush.
        <div
          data-slot="card-footer"
          className="bg-muted/50 px-(--card-spacing) text-muted-foreground border-t py-2.5 text-xs"
        >
          {footer}
        </div>
      ) : null}
    </Card>
  );
};

/** A quiet link to the next step, for a section's footer. */
export const NextStep = ({
  href,
  children,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) => {
  const className =
    'hover:text-foreground inline-flex items-center gap-1 font-medium transition-colors';
  const body = (
    <>
      {children}
      <ArrowRight aria-hidden="true" className="size-3.5 shrink-0" />
    </>
  );

  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
};

/** What a section says when the period has nothing for it, and what would fill it. */
export const SectionEmpty = ({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <div className="px-(--card-spacing) flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
    <p className="text-muted-foreground max-w-sm text-sm">{children}</p>
    {action}
  </div>
);
