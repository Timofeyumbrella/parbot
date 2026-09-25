import { cn } from 'cn';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { useId } from 'react';

import { Label } from '@/components/ui/label';

type FormFieldProps = {
  label: string;
  /** Rendered under the control. Keep it to one sentence. */
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  /** Receives the ids the control must carry so the label, hint and error are announced. */
  children: (control: {
    id: string;
    'aria-invalid': boolean | undefined;
    'aria-describedby': string | undefined;
  }) => React.ReactNode;
};

/** A labelled control with its hint and inline error. Works for inputs, textareas and selects. */
export const FormField = ({ label, hint, error, className, children }: FormFieldProps) => {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={errorId} className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
};

/** A message about the whole form: what happened and, when it went wrong, what to try. */
export const FormMessage = ({
  tone,
  children,
  className,
}: {
  tone: 'error' | 'success';
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    role={tone === 'error' ? 'alert' : 'status'}
    className={cn(
      'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
      tone === 'error'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'border-success/30 bg-success/10 text-foreground',
      className,
    )}
  >
    {tone === 'error' ? (
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
    ) : (
      <CircleCheck className="text-success mt-0.5 size-4 shrink-0" />
    )}
    <span>{children}</span>
  </div>
);
