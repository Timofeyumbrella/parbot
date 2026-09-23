import { Skeleton } from '@/components/ui/skeleton';

/** Shaped like a conversation: a back link, the title, alternating bubbles and the side panel. */
export default function ConversationLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8" aria-busy="true">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-14" />
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-72 max-w-full" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-5">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={index % 2 === 0 ? 'flex flex-row-reverse gap-3' : 'flex gap-3'}>
              <Skeleton className="size-6 shrink-0" />
              <Skeleton className={index % 2 === 0 ? 'h-10 w-1/2' : 'h-24 w-3/4'} />
            </div>
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
