import { cn } from 'cn';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type SegmentedProps<T extends string> = {
  name: string;
  label: string;
  /** Keeps the label for screen readers only, for a control that sits under a title saying the same. */
  hideLabel?: boolean;
  options: SegmentedOption<T>[];
  defaultValue: T;
  hint?: React.ReactNode;
  description?: string;
  className?: string;
};

/**
 * A row of radio buttons drawn as one control. Plain inputs underneath, so the value submits
 * with the form and a disabled option simply cannot be picked.
 */
export const Segmented = <T extends string>({
  name,
  label,
  hideLabel = false,
  options,
  defaultValue,
  hint,
  description,
  className,
}: SegmentedProps<T>) => (
  <fieldset className={cn('flex min-w-0 flex-col gap-1.5', className)}>
    <legend
      className={cn(
        'mb-1.5 flex items-center gap-2 text-sm font-medium leading-none',
        hideLabel && 'sr-only',
      )}
    >
      {label}
      {hint}
    </legend>
    <div className="bg-muted inline-flex w-fit gap-0.5 rounded-lg p-0.5">
      {options.map((option) => (
        <label
          key={option.value}
          className="text-muted-foreground has-checked:bg-background has-checked:text-foreground has-focus-visible:ring-ring/50 has-checked:shadow-sm has-focus-visible:ring-2 has-disabled:cursor-not-allowed has-disabled:opacity-50 cursor-pointer select-none rounded-md px-3 py-1 text-sm font-medium transition-colors"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={option.value === defaultValue}
            disabled={option.disabled}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
    {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
  </fieldset>
);
