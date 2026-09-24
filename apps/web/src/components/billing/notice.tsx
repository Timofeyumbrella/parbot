import { cn } from 'cn';
import { CircleCheck, Info, TriangleAlert } from 'lucide-react';

type NoticeProps = {
  tone: 'success' | 'warning' | 'info';
  title: string;
  children?: React.ReactNode;
  className?: string;
};

const tones = {
  success: {
    icon: CircleCheck,
    className: 'border-success/40 bg-success/10 text-foreground [&_svg]:text-success',
  },
  warning: {
    icon: TriangleAlert,
    className: 'border-warning/40 bg-warning/10 text-foreground [&_svg]:text-warning',
  },
  info: {
    icon: Info,
    className: 'border-border bg-muted/60 text-foreground [&_svg]:text-muted-foreground',
  },
};

/** A short inline message about something that just happened on this screen. */
export const Notice = ({ tone, title, children, className }: NoticeProps) => {
  const { icon: Icon, className: toneClass } = tones[tone];

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm',
        toneClass,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-0.5">
        <p className="font-medium">{title}</p>
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
};
