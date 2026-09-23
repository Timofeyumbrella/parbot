import { Skeleton } from '@/components/ui/skeleton';

/** Shaped like the Inbox: header, two tabs, the filter row and a list of rows. */
export default function InboxLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="flex gap-4 border-b pb-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-8 w-72" />
      <div className="divide-y rounded-lg border">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-2/3 max-w-sm" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
