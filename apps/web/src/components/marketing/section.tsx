import { cn } from 'cn';

/** Marketing content width: 1120px, with a comfortable gutter on phones. */
export const Container = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={cn('mx-auto w-full max-w-[70rem] px-5 sm:px-8', className)}>{children}</div>
);

type SectionProps = {
  id: string;
  className?: string;
  children: React.ReactNode;
};

/** A landmark with a stable anchor. The heading inside must use `${id}-heading` as its id. */
export const Section = ({ id, className, children }: SectionProps) => (
  <section
    id={id}
    aria-labelledby={`${id}-heading`}
    className={cn('scroll-mt-16 py-20 sm:py-28', className)}
  >
    {children}
  </section>
);

type SectionHeadingProps = {
  id: string;
  eyebrow: string;
  title: string;
  lede?: string;
  align?: 'left' | 'center';
  className?: string;
};

export const SectionHeading = ({ id, eyebrow, title, lede, align = 'left', className }: SectionHeadingProps) => (
  <div
    className={cn(
      'flex max-w-2xl flex-col gap-4',
      align === 'center' && 'mx-auto items-center text-center',
      className,
    )}
  >
    <p className="text-primary text-xs font-medium tracking-[0.14em] uppercase">{eyebrow}</p>
    <h2
      id={`${id}-heading`}
      className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
    >
      {title}
    </h2>
    {lede ? <p className="text-muted-foreground text-base leading-relaxed text-pretty sm:text-lg">{lede}</p> : null}
  </div>
);
