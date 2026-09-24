import { Container } from '@/components/marketing/section';
import { Skeleton } from '@/components/ui/skeleton';

/** Shaped like the hero: headline lines on the left, the demo panel on the right. */
export default function Loading() {
  return (
    <main id="main" className="flex-1" aria-busy="true" aria-label="Loading">
      <Container className="grid items-center gap-12 pt-14 pb-20 sm:pt-20 sm:pb-28 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-3 w-44" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-12 w-full max-w-lg" />
            <Skeleton className="h-12 w-4/5 max-w-md" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-full max-w-xl" />
            <Skeleton className="h-5 w-11/12 max-w-xl" />
            <Skeleton className="h-5 w-3/4 max-w-xl" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <Skeleton className="h-[26rem] w-full rounded-xl" />
      </Container>
    </main>
  );
}
