'use client';

import { cn } from 'cn';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { AnswerMarkdown } from './answer-markdown';
import {
  createDemoPlayer,
  DEMO_ASSISTANT_NAME,
  DEMO_SCENES,
  DEMO_SOURCES,
  DEMO_SUGGESTIONS,
  DEMO_WELCOME,
  type DemoScene,
  type DemoSource,
  demoSteps,
  type DemoTurn,
  initialView,
} from './demo-script';
import {
  AssistantTurn,
  DemoComposer,
  DemoFrame,
  LeadForm,
  SourcesRow,
  ThinkingDots,
  UserBubble,
} from './demo-window';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const subscribeReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia?.(REDUCED_MOTION);

  query?.addEventListener('change', onChange);

  return () => query?.removeEventListener('change', onChange);
};

/** The server renders the first exchange still, which is also what reduced motion keeps. */
const usePrefersReducedMotion = () =>
  useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia?.(REDUCED_MOTION).matches ?? false,
    () => false,
  );

type TurnProps = Omit<DemoTurn, 'scene'> & { scene: DemoScene };

const Turn = memo(function Turn({ scene, shown, settled, lead }: TurnProps) {
  const unanswered = scene.citations.length === 0;

  return (
    <>
      <UserBubble>{scene.question}</UserBubble>
      <AssistantTurn
        name={DEMO_ASSISTANT_NAME}
        footer={
          settled && scene.citations.length > 0 ? (
            <SourcesRow citations={scene.citations} />
          ) : lead ? (
            <LeadForm {...lead} />
          ) : null
        }
      >
        {shown === null ? (
          <ThinkingDots />
        ) : (
          <AnswerMarkdown
            content={scene.answer.slice(0, shown)}
            citations={scene.citations}
            streaming={!settled}
            className={cn(unanswered && 'text-muted-foreground')}
          />
        )}
      </AssistantTurn>
    </>
  );
});

const Welcome = ({ suggestions }: { suggestions: string[] }) => (
  <AssistantTurn
    name={DEMO_ASSISTANT_NAME}
    footer={
      <ul className="flex flex-wrap gap-1.5" data-testid="demo-suggestions">
        {suggestions.map((question) => (
          <li
            key={question}
            className="bg-background text-muted-foreground rounded-md border px-2 py-1 text-xs"
          >
            {question}
          </li>
        ))}
      </ul>
    }
  >
    <p className="text-sm leading-relaxed">{DEMO_WELCOME}</p>
  </AssistantTurn>
);

type ScriptedDemoProps = {
  scenes?: DemoScene[];
  sources?: DemoSource[];
  suggestions?: string[];
};

/**
 * The hero's picture of the product in use: a docs assistant for a made-up payments API answers a
 * few questions the way the widget does, typed, streamed, cited, and once honestly unanswered.
 * It plays only while on screen and in a visible tab, and not at all under reduced motion; the
 * first exchange is rendered finished on the server, so the frame is complete before any script.
 * It never touches the network.
 */
export const ScriptedDemo = ({
  scenes = DEMO_SCENES,
  sources = DEMO_SOURCES,
  suggestions = DEMO_SUGGESTIONS,
}: ScriptedDemoProps) => {
  const [played, setPlayed] = useState(() => initialView(scenes));
  const reducedMotion = usePrefersReducedMotion();
  const still = useMemo(() => initialView(scenes), [scenes]);
  // The script starts by showing the initial view, so what `played` last held never shows again.
  const view = reducedMotion ? still : played;
  const figureRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }

    const player = createDemoPlayer(demoSteps(scenes), setPlayed);
    const figure = figureRef.current;
    let onScreen = typeof IntersectionObserver === 'undefined' || !figure;
    const sync = () => {
      if (onScreen && document.visibilityState !== 'hidden') {
        player.play();
      } else {
        player.pause();
      }
    };
    const observer =
      onScreen || !figure
        ? null
        : new IntersectionObserver((entries) => {
            onScreen = entries.some((entry) => entry.isIntersecting);
            sync();
          });

    if (observer && figure) {
      observer.observe(figure);
    }

    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      player.pause();
    };
  }, [reducedMotion, scenes]);

  // Like the chat: the newest line stays in view, and the composer shows the end of what is typed.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const field = fieldRef.current;

    if (body) {
      body.scrollTop = body.scrollHeight;
    }

    if (field) {
      field.scrollLeft = field.scrollWidth;
    }
  }, [view]);

  return (
    <figure
      ref={figureRef}
      aria-label="Example conversation with a documentation assistant"
      className="m-0 flex min-w-0 flex-col"
    >
      {/* The frame is inert and hidden from assistive tech; this says what it shows. */}
      <figcaption className="sr-only">
        A scripted example on fictional docs. A reader asks the {DEMO_ASSISTANT_NAME} docs
        assistant: {scenes.map((scene) => scene.question).join(' ')} Each answer streams in with the
        sources it came from.
        {scenes.some((scene) => scene.lead)
          ? ' When the docs do not cover a question, the assistant says so and offers to take the reader’s email.'
          : ''}
      </figcaption>
      <DemoFrame
        title={DEMO_ASSISTANT_NAME}
        sources={sources}
        bodyRef={bodyRef}
        composer={<DemoComposer draft={view.draft} sending={view.sending} fieldRef={fieldRef} />}
      >
        {view.turns.length === 0 ? (
          <Welcome suggestions={suggestions} />
        ) : (
          view.turns.map((turn, position) => (
            <Turn
              // A fresh conversation replays the same scenes; its turns are new ones.
              key={`${position}:${turn.scene}`}
              scene={scenes[turn.scene]!}
              shown={turn.shown}
              settled={turn.settled}
              lead={turn.lead}
            />
          ))
        )}
      </DemoFrame>
    </figure>
  );
};
