import { cn } from 'cn';

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
};

/** The heading strip every dashboard screen starts with. */
export const PageHeader = ({ title, description, actions, className }: PageHeaderProps) => (
  <header className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
    <div className="flex min-w-0 flex-col gap-1">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
  </header>
);

/** Standard content width and padding for dashboard screens that are not the chat. */
export const PageContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8', className)}>
    {children}
  </div>
);
