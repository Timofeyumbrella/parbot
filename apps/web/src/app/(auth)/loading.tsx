import { Skeleton } from '@/components/ui/skeleton';

/** Shaped like the auth card: brand, tagline, three fields and a button. */
export default function AuthLoading() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="bg-card ring-foreground/10 flex w-full flex-col gap-4 rounded-xl p-4 ring-1">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-52" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-8 w-full" />
        </div>
        <Skeleton className="h-8 w-full" />
      </div>
      <Skeleton className="h-4 w-44" />
    </div>
  );
}
