import { cn } from 'cn';

const Line = ({ className }: { className?: string }) => (
  <div className={cn('sheen h-3.5 rounded-md', className)} />
);

/** Stands in for a thread while its messages load: a question on the right, an answer on the left, twice. */
export const ThreadSkeleton = ({ className }: { className?: string }) => (
  <div
    className={cn('flex flex-col gap-7', className)}
    aria-hidden="true"
    data-testid="thread-skeleton"
  >
    <div className="flex justify-end">
      <div className="sheen h-9 w-2/5 rounded-2xl rounded-br-md" />
    </div>
    <div className="flex gap-3">
      <span className="bg-muted mt-2 size-2 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2.5 pt-1">
        <Line className="w-20" />
        <Line className="w-11/12" />
        <Line className="w-full" />
        <Line className="w-3/4" />
        <div className="sheen mt-1 h-20 w-full rounded-lg" />
        <Line className="w-2/3" />
      </div>
    </div>
    <div className="flex justify-end">
      <div className="sheen h-9 w-1/4 rounded-2xl rounded-br-md" />
    </div>
    <div className="flex gap-3">
      <span className="bg-muted mt-2 size-2 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2.5 pt-1">
        <Line className="w-20" />
        <Line className="w-full" />
        <Line className="w-5/6" />
      </div>
    </div>
  </div>
);

/** The welcome screen's shape: name, message, three chips. */
export const WelcomeSkeleton = () => (
  <div className="flex flex-col items-center gap-4 text-center" aria-hidden="true">
    <span className="bg-muted size-2.5 rounded-full" />
    <Line className="h-5 w-40" />
    <Line className="w-72 max-w-full" />
    <div className="mt-2 flex flex-wrap justify-center gap-2">
      <div className="sheen h-8 w-40 rounded-full" />
      <div className="sheen h-8 w-52 rounded-full" />
      <div className="sheen h-8 w-32 rounded-full" />
    </div>
  </div>
);

/** A composer-shaped box for the loading state, so the screen does not jump when the real one mounts. */
export const ComposerSkeleton = () => (
  <div className="flex flex-col gap-1.5" aria-hidden="true">
    <div className="bg-card h-13 flex items-end gap-2 rounded-xl border p-2">
      <div className="sheen h-4 flex-1 self-center rounded-md" />
      <div className="bg-muted size-7 rounded-md" />
    </div>
    <div className="h-4" />
  </div>
);

/** Rows for the conversation pane while the layout loads. */
export const ConversationListSkeleton = () => (
  <div className="flex flex-col gap-1 p-2" aria-hidden="true">
    {Array.from({ length: 8 }, (_, index) => (
      <div key={index} className="flex h-10 items-center gap-2 px-2">
        <Line className={index % 3 === 0 ? 'w-3/4' : index % 3 === 1 ? 'w-1/2' : 'w-2/3'} />
        <Line className="ml-auto w-6" />
      </div>
    ))}
  </div>
);
