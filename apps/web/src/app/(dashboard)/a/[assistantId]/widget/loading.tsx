import { PageContainer } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';

/** Shaped like the widget screen: a header, a settings column and an install/preview column. */
export default function WidgetLoading() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-[700px] rounded-xl" />
        </div>
      </div>
    </PageContainer>
  );
}
