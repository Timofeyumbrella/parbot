'use client';

import { SendHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

import { DEMO_ASSISTANT_NAME, DEMO_SCENES, DEMO_TIMING, type DemoScene, splitCitationMarkers } from './demo-script';
import { AssistantTurn, CitationMarker, DemoWindow, ThinkingDots, UserBubble } from './demo-window';

type Phase =
  | { kind: 'typing'; typed: string }
  | { kind: 'thinking' }
  | { kind: 'streaming'; streamed: string }
  | { kind: 'done' };

type State = { scene: number; phase: Phase };

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);

      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Plays a canned conversation on a loop: a question is typed, sent, answered word by word and
 * cited, exactly as the real widget behaves. The first scene renders complete on the server so
 * the panel is meaningful before any script runs and stays that way under reduced motion.
 */
export const ScriptedDemo = ({ scenes = DEMO_SCENES }: { scenes?: DemoScene[] }) => {
  const [state, setState] = useState<State>({ scene: 0, phase: { kind: 'done' } });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const play = async () => {
      await sleep(0, signal);

      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || scenes.length < 2) {
        return;
      }

      await sleep(DEMO_TIMING.holdMs, signal);

      for (let index = 1; ; index = (index + 1) % scenes.length) {
        const scene = scenes[index]!;

        setState({ scene: index, phase: { kind: 'typing', typed: '' } });

        for (let length = 1; length <= scene.question.length; length += 1) {
          await sleep(DEMO_TIMING.keystrokeMs, signal);
          setState({ scene: index, phase: { kind: 'typing', typed: scene.question.slice(0, length) } });
        }

        await sleep(DEMO_TIMING.beforeSendMs, signal);
        setState({ scene: index, phase: { kind: 'thinking' } });
        await sleep(DEMO_TIMING.thinkMs, signal);

        const words = scene.answer.split(' ');
        let streamed = '';

        for (const [position, word] of words.entries()) {
          streamed += position === 0 ? word : ` ${word}`;
          setState({ scene: index, phase: { kind: 'streaming', streamed } });
          await sleep(DEMO_TIMING.wordMs, signal);
        }

        setState({ scene: index, phase: { kind: 'done' } });
        await sleep(DEMO_TIMING.holdMs, signal);
      }
    };

    play().catch(() => {
      // Aborted on unmount; nothing to clean up beyond the timers sleep() already cleared.
    });

    return () => controller.abort();
  }, [scenes]);

  const scene = scenes[state.scene] ?? scenes[0]!;
  const { phase } = state;

  return (
    <div role="figure" aria-label="Example conversation with a documentation assistant">
      <DemoWindow
        label="Demo"
        title={DEMO_ASSISTANT_NAME}
        ariaLive="off"
        footer={
          <div className="flex items-center gap-2" aria-hidden="true">
            <div className="bg-background flex h-9 min-w-0 flex-1 items-center rounded-md border px-3 text-sm">
              {phase.kind === 'typing' && phase.typed ? (
                <span className="streaming-caret truncate">{phase.typed}</span>
              ) : (
                <span className="text-muted-foreground truncate">Ask a question about the docs</span>
              )}
            </div>
            <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
              <SendHorizontal className="size-4" />
            </span>
          </div>
        }
      >
        {phase.kind === 'typing' ? (
          <>
            <AssistantTurn>
              <p>Ask anything about the {DEMO_ASSISTANT_NAME} documentation.</p>
            </AssistantTurn>
            <ul className="ml-9 flex flex-wrap gap-1.5" aria-label="Suggested questions">
              {scenes.slice(0, 3).map((item) => (
                <li
                  key={item.question}
                  className="bg-background text-muted-foreground rounded-md border px-2 py-1 text-xs"
                >
                  {item.question}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <UserBubble>{scene.question}</UserBubble>
            {phase.kind === 'thinking' ? (
              <AssistantTurn>
                <ThinkingDots />
              </AssistantTurn>
            ) : null}
            {phase.kind === 'streaming' ? (
              <AssistantTurn streaming>
                <p>{phase.streamed}</p>
              </AssistantTurn>
            ) : null}
            {phase.kind === 'done' ? (
              <>
                <AssistantTurn citations={scene.citations}>
                  <p>
                    {splitCitationMarkers(scene.answer).map((segment, position) =>
                      segment.type === 'text' ? (
                        <span key={position}>{segment.text}</span>
                      ) : (
                        <CitationMarker
                          key={position}
                          index={segment.index}
                          citation={scene.citations.find((citation) => citation.index === segment.index)}
                        />
                      ),
                    )}
                  </p>
                </AssistantTurn>
                {scene.unanswered ? <LeadCapturePreview /> : null}
              </>
            ) : null}
          </>
        )}
      </DemoWindow>
    </div>
  );
};

/** What the widget offers after an unanswered question on plans with lead capture. Decorative. */
const LeadCapturePreview = () => (
  <div className="bg-muted/60 ml-9 flex flex-col gap-2 rounded-lg border p-3 text-xs" aria-hidden="true">
    <p className="font-medium">Want the team to follow up? Leave your email.</p>
    <div className="flex gap-2">
      <div className="bg-background text-muted-foreground flex h-8 flex-1 items-center rounded-md border px-2">
        you@company.com
      </div>
      <span className="bg-primary text-primary-foreground flex h-8 items-center rounded-md px-3 font-medium">
        Send
      </span>
    </div>
  </div>
);
