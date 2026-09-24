import { PageContainer } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';

/** The Knowledge screen's shape: header with meter and button, then a list of source rows. */
export default function KnowledgeLoading() {
  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden w-48 flex-col gap-2 sm:flex">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-1 w-full" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      <div className="divide-border divide-y rounded-xl border">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-start gap-3 px-4 py-3">
            <Skeleton className="size-8 rounded-md" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-72" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="size-7 rounded-md" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
