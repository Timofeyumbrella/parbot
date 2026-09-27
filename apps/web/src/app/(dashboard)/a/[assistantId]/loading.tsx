import { Skeleton } from '@/components/ui/skeleton';

/** A card with a title strip, its body, and optionally a footer line, like an Overview section. */
const SectionSkeleton = ({
  children,
  footer = true,
  testId,
}: {
  children: React.ReactNode;
  footer?: boolean;
  testId?: string;
}) => (
  <div
    className="bg-card ring-foreground/10 flex flex-col overflow-hidden rounded-xl ring-1"
    data-testid={testId}
  >
    <div className="flex items-start justify-between gap-4 border-b p-4">
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
    </div>
    {children}
    {footer ? (
      <div className="border-t px-4 py-2.5">
        <Skeleton className="h-3.5 w-48" />
      </div>
    ) : null}
  </div>
);

const Rows = ({ count }: { count: number }) => (
  <div className="flex flex-col">
    {Array.from({ length: count }, (_, index) => (
      <div key={index} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-4 w-14" />
      </div>
    ))}
  </div>
);

/**
 * Shaped like the Overview: the header with the period switch, answer quality with its three
 * numbers and the trend, the knowledge gaps, disliked answers beside the reader pages, the content
 * panels, and usage beside leads.
 */
export default function OverviewLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8"
      aria-busy="true"
      data-testid="overview-loading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>

      <SectionSkeleton>
        <div className="grid gap-5 p-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3.5 w-40" />
            </div>
          ))}
        </div>
        <div className="border-t p-4">
          <Skeleton className="h-[150px]" />
        </div>
      </SectionSkeleton>

      <SectionSkeleton>
        <Rows count={4} />
      </SectionSkeleton>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionSkeleton>
          <Rows count={3} />
        </SectionSkeleton>
        <SectionSkeleton footer={false}>
          <Rows count={4} />
        </SectionSkeleton>
      </div>

      <SectionSkeleton>
        <div className="grid lg:grid-cols-2">
          <Rows count={3} />
          <Rows count={3} />
        </div>
      </SectionSkeleton>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SectionSkeleton>
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </SectionSkeleton>
        <SectionSkeleton>
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        </SectionSkeleton>
      </div>
    </div>
  );
}
