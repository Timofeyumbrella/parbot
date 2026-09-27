import { PageContainer } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';

/** The viewer's shape: back link, breadcrumb, title with its source line, the button, then text. */
export const DocumentSkeleton = () => (
  <PageContainer className="max-w-3xl">
    <div className="flex flex-col gap-5" aria-label="Loading the page" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
        <Skeleton className="h-7 w-28" />
      </div>
      <div className="flex flex-col gap-3 rounded-xl border px-4 py-5 sm:px-6">
        {['w-11/12', 'w-full', 'w-4/5', 'w-full', 'w-3/4', 'w-5/6', 'w-2/3'].map((width, index) => (
          <Skeleton key={index} className={`h-3.5 ${width}`} />
        ))}
      </div>
    </div>
  </PageContainer>
);
