import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { groupCitationsByPageAscending } from '@/lib/citations';
import { UNANSWERED_TEXT } from '@/lib/engine/prompt';

import {
  createDemoPlayer,
  DEMO_SCENES,
  DEMO_SOURCES,
  DEMO_TIMING,
  type DemoScene,
  type DemoStep,
  demoSteps,
  type DemoView,
  initialView,
  streamBreaks,
} from './demo-script';

const MARKER = /\[(\d{1,2})\]/g;

/** Markers outside code, which is where the answer cites. */
const markers = (answer: string) =>
  [...answer.replace(/```[\s\S]*?```|`[^`\n]*`/g, '').matchAll(MARKER)].map((match) =>
    Number(match[1]),
  );

const SCENES: DemoScene[] = [
  {
    question: 'One?',
    answer: 'First answer [1].',
    citations: [{ index: 1, documentId: 'a', title: 'a.md', url: null }],
  },
  {
    question: 'Two?',
    answer: 'Second answer, a bit longer [1].',
    citations: [{ index: 1, documentId: 'b', title: 'b.md', url: null }],
  },
  {
    question: 'Three?',
    answer: 'Not covered.',
    citations: [],
    lead: { email: 'a@b.co' },
  },
];

/** Every step of one pass: from the initial view to the next conversation's first question sent. */
const onePass = (scenes: DemoScene[]) => {
  const steps: DemoStep[] = [];

  for (const step of demoSteps(scenes)) {
    steps.push(step);

    const sentAgain =
      step.view.turns.length === 1 &&
      step.view.turns[0]!.scene === 0 &&
      step.view.turns[0]!.shown === null;

    if (sentAgain || steps.length > 5_000) {
      break;
    }
  }

  return steps;
};

describe('DEMO_SCENES', () => {
  it('cites only sources the frame lists, and every marker it uses', () => {
    const ids = DEMO_SOURCES.map((source) => source.id);

    for (const scene of DEMO_SCENES) {
      for (const index of markers(scene.answer)) {
        expect(
          scene.citations.some((citation) => citation.index === index),
          `${scene.question} [${index}]`,
        ).toBe(true);
      }

      for (const citation of scene.citations) {
        expect(ids).toContain(citation.documentId);
      }
    }
  });

  it('shows Markdown with code, a source cited twice, and one honest refusal with a lead', () => {
    expect(DEMO_SCENES.filter((scene) => scene.answer.includes('```'))).toHaveLength(2);
    expect(
      DEMO_SCENES.some((scene) =>
        groupCitationsByPageAscending(scene.citations).some((page) => page.indexes.length > 1),
      ),
    ).toBe(true);

    const refusals = DEMO_SCENES.filter((scene) => scene.lead);

    expect(refusals).toHaveLength(1);
    expect(refusals[0]!.answer).toBe(UNANSWERED_TEXT);
    expect(refusals[0]!.citations).toEqual([]);
  });
});

describe('streamBreaks', () => {
  it('ends every chunk after whitespace and the last one at the end', () => {
    for (const scene of DEMO_SCENES) {
      const breaks = streamBreaks(scene.answer);

      expect(breaks.at(-1)).toBe(scene.answer.length);
      expect([...breaks].sort((a, b) => a - b)).toEqual(breaks);
      expect(new Set(breaks).size).toBe(breaks.length);

      for (const end of breaks.slice(0, -1)) {
        expect(scene.answer[end - 1], `${scene.question} at ${end}`).toMatch(/\s/);
      }
    }
  });

  it('streams a few words at a time, so a long answer takes many chunks', () => {
    const breaks = streamBreaks(DEMO_SCENES[1]!.answer);

    expect(breaks.length).toBeGreaterThan(20);
  });
});

describe('demoSteps', () => {
  it('starts from the finished first exchange and holds it before the next question', () => {
    const [first, second] = onePass(SCENES);

    expect(first).toEqual({ wait: 0, view: initialView(SCENES) });
    expect(second!.wait).toBeGreaterThanOrEqual(DEMO_TIMING.startMs);
    expect(second!.view.draft).toBe('T');
  });

  it('types, sends, thinks, streams and cites each question in order, then starts over', () => {
    const views = onePass(SCENES).map((step) => step.view);
    const phases: string[] = [];
    const record = (phase: string) => {
      if (phases.at(-1) !== phase) {
        phases.push(phase);
      }
    };

    for (const view of views) {
      const last = view.turns.at(-1);

      if (view.sending) {
        record('press send');
      } else if (view.draft) {
        record('typing question');
      } else if (view.turns.length === 0) {
        record('welcome');
      } else if (last?.shown === null) {
        record(`thinking ${last.scene}`);
      } else if (last && !last.settled) {
        record(`streaming ${last.scene}`);
      } else if (last?.lead && !last.lead.sent) {
        record(last.lead.sending ? 'sending email' : 'typing email');
      } else if (last?.lead?.sent) {
        record('thanks');
      } else {
        record(`settled ${last?.scene}`);
      }
    }

    expect(phases).toEqual([
      'settled 0',
      'typing question',
      'press send',
      'thinking 1',
      'streaming 1',
      'settled 1',
      'typing question',
      'press send',
      'thinking 2',
      'streaming 2',
      'settled 2',
      'typing email',
      'sending email',
      'thanks',
      'welcome',
      'typing question',
      'press send',
      'thinking 0',
    ]);
  });

  it('types one character at a time and streams the answer until it is whole', () => {
    const views = onePass(SCENES).map((step) => step.view);
    const drafts = views.filter((view) => view.draft && !view.sending).map((view) => view.draft);

    expect(drafts.slice(0, 4)).toEqual(['T', 'Tw', 'Two', 'Two?']);

    const shown = views
      .map((view) => view.turns.find((turn) => turn.scene === 1)?.shown)
      .filter((value): value is number => typeof value === 'number');

    expect([...shown].sort((a, b) => a - b)).toEqual(shown);
    expect(shown.at(-1)).toBe(SCENES[1]!.answer.length);
    // The earlier exchange stays in the thread while the next one plays.
    expect(views.find((view) => view.turns.length === 2)?.turns[0]).toEqual(
      initialView(SCENES).turns[0],
    );
  });

  it('waits like a stream: a pause before the first chunk, short ones between the rest', () => {
    const streaming = onePass(SCENES).filter(({ view }) => {
      const last = view.turns.at(-1);

      return last?.scene === 1 && typeof last.shown === 'number' && !last.settled;
    });

    expect(streaming[0]!.wait).toBe(DEMO_TIMING.thinkMs);

    for (const step of streaming.slice(1)) {
      expect(step.wait).toBeGreaterThanOrEqual(20);
      expect(step.wait).toBeLessThan(DEMO_TIMING.thinkMs);
    }
  });
});

describe('createDemoPlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const view = (draft: string): DemoView => ({ turns: [], draft, sending: false });

  it('applies each view after its wait, and keeps the time already waited across a pause', () => {
    const applied: string[] = [];
    const player = createDemoPlayer(
      [
        { wait: 100, view: view('a') },
        { wait: 300, view: view('b') },
      ][Symbol.iterator](),
      (next) => applied.push(next.draft),
    );

    player.play();
    vi.advanceTimersByTime(100);
    expect(applied).toEqual(['a']);

    vi.advanceTimersByTime(200);
    player.pause();
    expect(player.playing).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(applied).toEqual(['a']);

    player.play();
    vi.advanceTimersByTime(99);
    expect(applied).toEqual(['a']);
    vi.advanceTimersByTime(1);
    expect(applied).toEqual(['a', 'b']);
  });

  it('does nothing until it is played', () => {
    const apply = vi.fn();

    createDemoPlayer([{ wait: 0, view: view('a') }][Symbol.iterator](), apply);
    vi.advanceTimersByTime(10_000);

    expect(apply).not.toHaveBeenCalled();
  });
});
