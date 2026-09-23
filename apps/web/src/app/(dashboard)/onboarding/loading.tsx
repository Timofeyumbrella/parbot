import { Skeleton } from '@/components/ui/skeleton';

/** Header, then a card with three fields and a button. */
export default function OnboardingLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="bg-card ring-foreground/10 flex flex-col gap-5 rounded-xl p-4 ring-1 sm:p-6">
        {[0, 1].map((index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-3 w-64" />
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-8 w-36" />
        </div>
      </div>
    </div>
  );
}
