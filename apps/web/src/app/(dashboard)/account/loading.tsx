import { Skeleton } from '@/components/ui/skeleton';

const FormCard = ({ fields }: { fields: number }) => (
  <div className="bg-card ring-foreground/10 flex flex-col gap-4 rounded-xl p-4 ring-1">
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-5 w-20" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
    {Array.from({ length: fields }, (_, index) => (
      <div key={index} className="flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-8 w-full" />
      </div>
    ))}
    <div className="flex justify-end">
      <Skeleton className="h-8 w-28" />
    </div>
  </div>
);

/** Header, the plan card, then one card per form. */
export default function AccountLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="bg-card ring-foreground/10 flex flex-col gap-4 rounded-xl p-4 ring-1">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <FormCard fields={1} />
      <FormCard fields={1} />
      <FormCard fields={2} />
    </div>
  );
}
