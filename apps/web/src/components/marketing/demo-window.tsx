import { cn } from 'cn';
import { Bot, ExternalLink } from 'lucide-react';

export type DemoCitation = {
  index: number;
  title: string;
  url: string | null;
};

type DemoWindowProps = {
  /** "Demo" for the scripted panel, "Live" when a real assistant answers. */
  label: string;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  className?: string;
  bodyRef?: React.Ref<HTMLDivElement>;
  /** "off" for the scripted loop, so screen readers are not read every streamed word. */
  ariaLive?: 'polite' | 'off';
  /** True while an answer streams, so assistive tech announces the whole reply once it settles. */
  ariaBusy?: boolean;
};

/** The chat window chrome shared by the scripted and the live hero demos. */
export const DemoWindow = ({
  label,
  title,
  children,
  footer,
  className,
  bodyRef,
  ariaLive = 'polite',
  ariaBusy = false,
}: DemoWindowProps) => (
  <div
    className={cn(
      'bg-card text-card-foreground ring-foreground/10 flex flex-col overflow-hidden rounded-xl shadow-2xl shadow-black/20 ring-1',
      className,
    )}
  >
    <div className="flex h-11 shrink-0 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="bg-primary size-2 rounded-full" aria-hidden="true" />
        {title}
      </div>
      <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
        {label}
      </span>
    </div>
    <div
      ref={bodyRef}
      className="flex h-[22rem] flex-col gap-4 overflow-y-auto p-4 sm:h-[24rem]"
      aria-live={ariaLive}
      aria-busy={ariaBusy}
    >
      {children}
    </div>
    <div className="shrink-0 border-t p-3">{footer}</div>
  </div>
);

export const UserBubble = ({ children }: { children: React.ReactNode }) => (
  <div className="flex justify-end">
    <p className="bg-muted max-w-[85%] rounded-lg rounded-br-sm px-3 py-2 text-sm">{children}</p>
  </div>
);

type AssistantTurnProps = {
  children: React.ReactNode;
  streaming?: boolean;
  citations?: DemoCitation[];
  tone?: 'default' | 'error';
};

export const AssistantTurn = ({
  children,
  streaming = false,
  citations = [],
  tone = 'default',
}: AssistantTurnProps) => (
  <div className="flex gap-3">
    <span
      className="bg-primary text-primary-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md"
      aria-hidden="true"
    >
      <Bot className="size-3.5" />
    </span>
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div
        className={cn(
          'text-sm leading-relaxed [&_p+p]:mt-2 [&_p]:m-0',
          streaming && 'streaming-caret',
          tone === 'error' && 'text-destructive',
        )}
      >
        {children}
      </div>
      {citations.length > 0 ? <CitationList citations={citations} /> : null}
    </div>
  </div>
);

export const CitationList = ({ citations }: { citations: DemoCitation[] }) => (
  <ul className="flex flex-wrap gap-1.5" aria-label="Sources">
    {citations.map((citation) => {
      const body = (
        <>
          <span className="bg-primary/15 text-primary flex size-4 items-center justify-center rounded-sm font-mono text-[10px] font-semibold">
            {citation.index}
          </span>
          <span className="truncate">{citation.title}</span>
          {citation.url ? (
            <ExternalLink className="text-muted-foreground size-3 shrink-0" aria-hidden="true" />
          ) : null}
        </>
      );
      const className =
        'bg-background hover:bg-muted inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors';

      return (
        <li key={citation.index} className="max-w-full">
          {citation.url ? (
            <a href={citation.url} target="_blank" rel="noreferrer" className={className}>
              {body}
            </a>
          ) : (
            <span className={className}>{body}</span>
          )}
        </li>
      );
    })}
  </ul>
);

export const ThinkingDots = () => (
  <span className="flex h-5 items-center gap-1" aria-label="Thinking">
    {[0, 1, 2].map((dot) => (
      <span
        key={dot}
        className="bg-muted-foreground/60 size-1.5 animate-pulse rounded-full motion-reduce:animate-none"
        style={{ animationDelay: `${dot * 150}ms` }}
      />
    ))}
  </span>
);

/** Inline [n] marker, rendered as a small chip that links to the cited page when known. */
export const CitationMarker = ({ index, citation }: { index: number; citation?: DemoCitation }) => {
  const className =
    'bg-primary/15 text-primary mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 align-text-top font-mono text-[10px] font-semibold no-underline';

  return citation?.url ? (
    <a
      href={citation.url}
      target="_blank"
      rel="noreferrer"
      className={className}
      title={citation.title}
    >
      {index}
    </a>
  ) : (
    <span className={className}>{index}</span>
  );
};
