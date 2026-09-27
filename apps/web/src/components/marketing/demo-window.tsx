import { cn } from 'cn';
import {
  Bot,
  CircleCheck,
  ExternalLink,
  FileCode,
  FileText,
  FileType,
  Globe,
  type LucideIcon,
  SendHorizontal,
} from 'lucide-react';

import { groupCitationsByPageAscending } from '@/lib/citations';

import type { DemoCitation, DemoSource, DemoSourceKind } from './demo-script';

const SOURCE_ICONS: Record<DemoSourceKind, LucideIcon> = {
  pdf: FileText,
  markdown: FileCode,
  docx: FileType,
  website: Globe,
};

type DemoFrameProps = {
  title: string;
  sources: DemoSource[];
  composer: React.ReactNode;
  children: React.ReactNode;
  bodyRef?: React.Ref<HTMLDivElement>;
};

/**
 * The window the scripted conversation plays in: the assistant, what it has indexed, the thread
 * and a composer. It is `inert`, so nothing in it takes focus, a click or a keystroke; the figure
 * around it describes it for assistive tech.
 */
export const DemoFrame = ({ title, sources, composer, children, bodyRef }: DemoFrameProps) => (
  <div
    inert
    data-testid="demo-frame"
    className="bg-card text-card-foreground ring-foreground/10 flex w-full min-w-0 select-none flex-col overflow-hidden rounded-xl shadow-2xl shadow-black/20 ring-1"
  >
    <div className="flex h-11 shrink-0 items-center gap-2.5 border-b px-4">
      <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-md">
        <Bot className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
      <span className="text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
        Example
      </span>
    </div>
    <SourcesStrip sources={sources} />
    {/*
      Scrolled by the script only, pinned to the newest line as the chat is; older turns fade out
      at the top. A fixed height keeps the page below still while answers grow, and on a phone it
      is tall enough for the first exchange whole, which is all reduced motion shows.
    */}
    <div
      ref={bodyRef}
      data-testid="demo-thread"
      className="flex h-[29rem] min-w-0 flex-col gap-5 overflow-hidden p-4 [mask-image:linear-gradient(to_bottom,transparent,black_1rem)] sm:h-[26rem]"
    >
      {children}
    </div>
    <div className="shrink-0 border-t p-3">{composer}</div>
  </div>
);

/** What the assistant answers from, as the Knowledge screen would list it: every source ready. */
export const SourcesStrip = ({ sources }: { sources: DemoSource[] }) => (
  // One line on a phone, fading out where it runs out of room; it wraps on wider screens.
  <div
    className="flex min-w-0 shrink-0 items-center gap-1.5 overflow-hidden border-b px-4 py-2 text-[11px] [mask-image:linear-gradient(to_right,black_80%,transparent)] sm:flex-wrap sm:[mask-image:none]"
    data-testid="demo-sources-strip"
  >
    <span className="text-success mr-1 inline-flex shrink-0 items-center gap-1 font-medium">
      <CircleCheck className="size-3" />
      {sources.length} sources ready
    </span>
    {sources.map((source) => {
      const Icon = SOURCE_ICONS[source.kind];

      return (
        <span
          key={source.id}
          className="bg-muted/60 text-muted-foreground inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5"
        >
          <Icon className="size-3" />
          <span className="text-foreground">{source.name}</span>
          <span className="hidden sm:inline">{source.detail}</span>
        </span>
      );
    })}
  </div>
);

export const UserBubble = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-w-0 justify-end">
    <p
      className="bg-muted wrap-anywhere max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md px-3.5 py-2 text-sm leading-relaxed"
      data-testid="demo-user-message"
    >
      {children}
    </p>
  </div>
);

type AssistantTurnProps = {
  name: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/** Laid out like the in-app chat's answer: a marker, the assistant's name, the answer, its sources. */
export const AssistantTurn = ({ name, children, footer }: AssistantTurnProps) => (
  <div className="flex min-w-0 gap-3">
    <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" />
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="text-muted-foreground text-xs font-medium">{name}</div>
      {children}
      {footer}
    </div>
  </div>
);

/** An inline [n] marker, styled as the chat's chip. */
export const CitationChip = ({ index }: { index: number }) => (
  <sup className="mx-0.5" data-citation={index}>
    <span className="bg-accent text-accent-foreground inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 align-baseline font-mono text-[10px] font-medium">
      {index}
    </span>
  </sup>
);

/**
 * The sources row under an answer: one chip per source with every marker that points at it,
 * markers ascending, like the chat's row. A web page shows its host; a file shows its name.
 */
export const SourcesRow = ({ citations }: { citations: DemoCitation[] }) => (
  <div className="flex min-w-0 flex-wrap items-center gap-1.5 pt-1" data-testid="demo-sources">
    <span className="text-muted-foreground mr-0.5 text-xs">Sources</span>
    <ul className="contents" aria-label="Sources">
      {groupCitationsByPageAscending(citations).map(({ citation, indexes }) => (
        <li
          key={indexes[0]}
          className="bg-background inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs"
        >
          <span className="inline-flex gap-0.5">
            {indexes.map((index) => (
              <span
                key={index}
                className="bg-accent text-accent-foreground inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 font-mono text-[10px] font-medium"
              >
                {index}
              </span>
            ))}
          </span>
          <span className="truncate">{citation.title}</span>
          {citation.url ? (
            <>
              <span className="text-muted-foreground truncate">{new URL(citation.url).host}</span>
              <ExternalLink className="text-muted-foreground size-3 shrink-0" />
            </>
          ) : null}
        </li>
      ))}
    </ul>
  </div>
);

export const ThinkingDots = () => (
  <span className="flex h-6 items-center gap-1" aria-label="Thinking">
    {[0, 1, 2].map((dot) => (
      <span
        key={dot}
        className="bg-muted-foreground/70 size-1.5 animate-pulse rounded-full motion-reduce:animate-none"
        style={{ animationDelay: `${dot * 150 - 400}ms` }}
      />
    ))}
  </span>
);

type LeadFormProps = {
  email: string;
  sending: boolean;
  sent: boolean;
};

/** The widget's offer after an answer the docs do not cover, with its own words. */
export const LeadForm = ({ email, sending, sent }: LeadFormProps) =>
  sent ? (
    <p className="text-muted-foreground text-xs" data-testid="demo-lead-thanks">
      Thanks. The team will reply to {email}.
    </p>
  ) : (
    <div
      className="bg-background flex flex-col gap-2 rounded-lg border p-3 text-xs"
      data-testid="demo-lead"
    >
      <p>Leave your email and the team will follow up with an answer.</p>
      <div className="bg-card flex h-8 min-w-0 items-center rounded-md border px-2.5">
        {email ? (
          <span className={cn('truncate', !sending && 'streaming-caret')}>{email}</span>
        ) : (
          <span className="text-muted-foreground truncate">you@company.com</span>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="text-muted-foreground px-2 py-1">No thanks</span>
        <span
          className={cn(
            'bg-primary text-primary-foreground rounded-md px-3 py-1 font-medium transition-opacity',
            sending && 'opacity-70',
          )}
        >
          Send
        </span>
      </div>
    </div>
  );

type ComposerProps = {
  draft: string;
  sending: boolean;
  /** The field, which the player scrolls to the end of the draft. */
  fieldRef?: React.Ref<HTMLDivElement>;
};

/**
 * A composer that only the script types into. A long question scrolls sideways inside it, as in
 * an input, so the end being typed stays in view; the script keeps it scrolled to the end.
 */
export const DemoComposer = ({ draft, sending, fieldRef }: ComposerProps) => (
  <div className="flex min-w-0 items-center gap-2">
    <div
      ref={fieldRef}
      className="bg-background flex h-9 min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap rounded-md border px-3 text-sm"
      data-testid="demo-composer"
    >
      {draft ? (
        <span className={cn('shrink-0 pr-1', !sending && 'streaming-caret')}>{draft}</span>
      ) : (
        <span className="text-muted-foreground truncate">Ask a question about the docs</span>
      )}
    </div>
    <span
      className={cn(
        'bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-md transition-[opacity,transform] duration-150 motion-reduce:transition-none',
        draft ? 'opacity-100' : 'opacity-50',
        sending && 'scale-95',
      )}
    >
      <SendHorizontal className="size-4" />
    </span>
  </div>
);
