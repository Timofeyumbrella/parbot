import { Skeleton } from '@/components/ui/skeleton';

/** The docs-site shell while the assistant name is looked up. */
export default function DemoLoading() {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <div className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="hidden h-4 w-40 sm:block" />
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-5xl flex-1 gap-10 px-4 py-10 md:grid-cols-[200px_minmax(0,1fr)]">
        <div className="hidden flex-col gap-2 md:flex">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-7" />
          ))}
        </div>
        <div className="flex max-w-2xl flex-col gap-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="mt-6 h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
        </div>
      </div>
    </div>
  );
}
