import { PageContainer } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';

/** Shaped like the Billing screen: header, plan card beside the meters, then three plan cards. */
export default function BillingLoading() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-44 lg:col-span-2" />
        <Skeleton className="h-44 lg:col-span-3" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    </PageContainer>
  );
}
