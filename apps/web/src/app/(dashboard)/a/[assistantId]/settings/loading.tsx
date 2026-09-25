import { Skeleton } from '@/components/ui/skeleton';

/** Header, the settings card with its fields and the Widget note, the key card and the danger zone. */
export default function SettingsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="bg-card ring-foreground/10 flex flex-col gap-5 rounded-xl p-4 ring-1">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-14 w-full" />
        <div className="flex justify-end">
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      <div className="bg-card ring-foreground/10 flex items-center justify-between gap-4 rounded-xl p-4 ring-1">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-6 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
