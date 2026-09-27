import { UNANSWERED_TEXT } from '@/lib/engine/prompt';

/**
 * The hero's scripted conversation. Northwind Payments and everything it indexes are made up, so
 * no claim here is about a real company, and nothing in the script reaches the network.
 */

export type DemoSourceKind = 'pdf' | 'markdown' | 'docx' | 'website';

export type DemoSource = {
  id: string;
  kind: DemoSourceKind;
  name: string;
  /** What the Knowledge screen shows under a source: a file's type and size, a site's page count. */
  detail: string;
};

export type DemoCitation = {
  index: number;
  /** The indexed source the passage came from; passages of one source share a chip. */
  documentId: string;
  title: string;
  url: string | null;
};

export type DemoScene = {
  question: string;
  answer: string;
  citations: DemoCitation[];
  /** The docs do not cover it: the honest refusal, then the widget's offer to take an email. */
  lead?: { email: string };
};

export const DEMO_ASSISTANT_NAME = 'Northwind Payments';

export const DEMO_WELCOME =
  'Ask me anything about the Northwind Payments API. I answer from its docs and list the sources.';

export const DEMO_SOURCES: DemoSource[] = [
  { id: 'api-reference', kind: 'pdf', name: 'api-reference.pdf', detail: '4.2 MB' },
  { id: 'webhooks', kind: 'markdown', name: 'webhooks.md', detail: '38 KB' },
  { id: 'auth-guide', kind: 'docx', name: 'auth-guide.docx', detail: '1.1 MB' },
  { id: 'changelog', kind: 'website', name: 'docs.northwind.dev/changelog', detail: '36 pages' },
];

const cite = (index: number, sourceId: string, url: string | null = null): DemoCitation => {
  const source = DEMO_SOURCES.find((item) => item.id === sourceId)!;

  return {
    index,
    documentId: source.id,
    title: source.kind === 'website' ? 'Changelog' : source.name,
    url,
  };
};

export const DEMO_SCENES: DemoScene[] = [
  {
    question: 'How do I refund part of a payment?',
    answer: [
      'Create a refund with an `amount` below the captured total, in minor units [1]. It needs a secret key; publishable keys are refused [2].',
      '',
      '```bash',
      'curl https://api.northwind.dev/v2/refunds \\',
      '  -u "$NORTHWIND_SECRET_KEY:" \\',
      '  -d payment=pay_3KfL0x2Qe8 \\',
      '  -d amount=1500',
      '```',
    ].join('\n'),
    citations: [cite(1, 'api-reference'), cite(2, 'auth-guide')],
  },
  {
    question: 'How do I verify a webhook signature?',
    answer: [
      'Every delivery carries a `Northwind-Signature` header with a timestamp and an HMAC-SHA256 of the body [1]. To check it:',
      '',
      '1. Read the raw request body before parsing it as JSON [1].',
      '2. Sign `timestamp.body` with the endpoint secret [1].',
      '3. Compare in constant time [3] and reject timestamps older than five minutes [2].',
      '',
      '```js',
      "const expected = createHmac('sha256', endpointSecret)",
      '  .update(`${timestamp}.${rawBody}`)',
      "  .digest('hex');",
      '```',
    ].join('\n'),
    citations: [
      cite(1, 'webhooks'),
      cite(2, 'changelog', 'https://docs.northwind.dev/changelog'),
      cite(3, 'webhooks'),
    ],
  },
  {
    question: 'Is there an official PHP SDK?',
    answer: UNANSWERED_TEXT,
    citations: [],
    lead: { email: 'dana@example.com' },
  },
];

/** What a fresh conversation suggests: questions the docs answer, as an owner would pick them. */
export const DEMO_SUGGESTIONS = [
  DEMO_SCENES[0]!.question,
  DEMO_SCENES[1]!.question,
  'Which currencies can I settle in?',
];

export const DEMO_TIMING = {
  /** On screen with the first exchange complete, before the next question starts. */
  startMs: 2400,
  /** Per character typed into the composer, varied a little by KEYSTROKE_JITTER. */
  keystrokeMs: 45,
  /** The question is complete; the reader glances at it before sending. */
  beforeSendMs: 450,
  /** The send button's pressed state. */
  pressMs: 160,
  /** Sent, and nothing streamed yet: the thinking dots. */
  thinkMs: 950,
  /** Between two streamed chunks, varied by CHUNK_JITTER. */
  chunkMs: 70,
  /** The last token, then the sources row, as the stream's citations event lands. */
  citationsMs: 260,
  /** Time to read a finished answer before the next question. */
  holdMs: 4200,
  /** The refusal, then the email form. */
  leadMs: 700,
  /** The thank-you line stays this long before the conversation starts over. */
  thanksMs: 4200,
  /** A fresh conversation's welcome, before its first question is typed. */
  welcomeMs: 1500,
} as const;

export type DemoTiming = { [Key in keyof typeof DEMO_TIMING]: number };

/** Keeps typing and streaming from ticking like a metronome, deterministically. */
const KEYSTROKE_JITTER = [0, 22, -10, 8, 35, -14, 4, 16, -6, 28];
const CHUNK_JITTER = [0, 30, -20, 55, -10, 15, 90, -25, 5, 40];
/** Words per streamed chunk: a model sends a few tokens at a time, not a word at a time. */
const CHUNK_WORDS = [2, 3, 1, 2, 4, 2, 3, 1, 3];

/**
 * Where each streamed chunk of `text` ends. Chunks end after whitespace, so a citation marker,
 * an inline code span or a fence line arrives whole, as it would from a model.
 */
export const streamBreaks = (text: string) => {
  const words = [...text.matchAll(/\S+\s*/g)].map((match) => match.index + match[0].length);
  const breaks: number[] = [];

  for (let at = 0, chunk = 0; at < words.length; chunk += 1) {
    at = Math.min(words.length, at + CHUNK_WORDS[chunk % CHUNK_WORDS.length]!);
    breaks.push(words[at - 1]!);
  }

  return breaks;
};

export type DemoTurn = {
  scene: number;
  /** Characters of the answer on screen; null until the first chunk arrives. */
  shown: number | null;
  /** The stream is over and the sources row is in. */
  settled: boolean;
  /** The email form after a refusal: the address typed so far, and whether it was sent. */
  lead: { email: string; sending: boolean; sent: boolean } | null;
};

export type DemoView = {
  /** Empty for a fresh conversation, which shows the welcome and suggested questions. */
  turns: DemoTurn[];
  /** What is typed in the composer. */
  draft: string;
  /** The send button is pressed. */
  sending: boolean;
};

export type DemoStep = { wait: number; view: DemoView };

const settledTurn = (scenes: DemoScene[], scene: number): DemoTurn => ({
  scene,
  shown: scenes[scene]!.answer.length,
  settled: true,
  lead: null,
});

/** The first exchange, finished: what the server renders and what reduced motion keeps. */
export const initialView = (scenes: DemoScene[]): DemoView => ({
  turns: scenes.length > 0 ? [settledTurn(scenes, 0)] : [],
  draft: '',
  sending: false,
});

/**
 * The script as a list of views, each with how long to wait before showing it. It starts from
 * the initial view, so a replay never continues from a stale frame, goes on with the second
 * exchange, plays the rest, then starts a fresh conversation from the first and loops for as long
 * as it is read.
 */
export function* demoSteps(
  scenes: DemoScene[],
  timing: DemoTiming = DEMO_TIMING,
): Generator<DemoStep, void, undefined> {
  if (scenes.length === 0) {
    return;
  }

  let turns = initialView(scenes).turns;
  let keystroke = 0;
  let chunk = 0;
  const view = (update: Partial<DemoView> = {}): DemoView => ({
    turns,
    draft: '',
    sending: false,
    ...update,
  });

  yield { wait: 0, view: view() };

  let wait = timing.startMs;
  const replaceLast = (update: Partial<DemoTurn>) => {
    turns = [...turns.slice(0, -1), { ...turns.at(-1)!, ...update }];
  };
  const typed = function* (text: string, show: (value: string) => DemoView) {
    for (let length = 1; length <= text.length; length += 1) {
      const pause = text[length - 2] === ' ' ? 40 : 0;

      yield {
        wait:
          wait +
          timing.keystrokeMs +
          KEYSTROKE_JITTER[keystroke++ % KEYSTROKE_JITTER.length]! +
          pause,
        view: show(text.slice(0, length)),
      };
      wait = 0;
    }
  };

  for (let index = 1 % scenes.length; ; index = (index + 1) % scenes.length) {
    if (index === 0) {
      turns = [];
      yield { wait, view: view() };
      wait = timing.welcomeMs;
    }

    const scene = scenes[index]!;

    yield* typed(scene.question, (draft) => view({ draft }));
    yield { wait: timing.beforeSendMs, view: view({ draft: scene.question, sending: true }) };

    turns = [...turns, { scene: index, shown: null, settled: false, lead: null }];
    yield { wait: timing.pressMs, view: view() };

    for (const [position, end] of streamBreaks(scene.answer).entries()) {
      replaceLast({ shown: end });
      yield {
        wait:
          position === 0
            ? timing.thinkMs
            : Math.max(20, timing.chunkMs + CHUNK_JITTER[chunk++ % CHUNK_JITTER.length]!),
        view: view(),
      };
    }

    replaceLast({ settled: true });
    yield { wait: timing.citationsMs, view: view() };
    wait = timing.holdMs;

    if (scene.lead) {
      const lead = { email: '', sending: false, sent: false };

      replaceLast({ lead });
      yield { wait: timing.leadMs, view: view() };
      wait = timing.leadMs;
      yield* typed(scene.lead.email, (email) => {
        replaceLast({ lead: { ...lead, email } });

        return view();
      });
      replaceLast({ lead: { email: scene.lead.email, sending: true, sent: false } });
      yield { wait: timing.beforeSendMs, view: view() };
      replaceLast({ lead: { email: scene.lead.email, sending: false, sent: true } });
      yield { wait: timing.pressMs, view: view() };
      wait = timing.thanksMs;
    }
  }
}

/**
 * Plays steps on timers that can be paused: the time already waited is kept, so a pause mid-way
 * resumes where it was instead of restarting the wait or skipping ahead.
 */
export const createDemoPlayer = (
  steps: Iterator<DemoStep, void, undefined>,
  apply: (view: DemoView) => void,
) => {
  let pending: DemoStep | null = null;
  let remaining = 0;
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let playing = false;

  const schedule = () => {
    startedAt = Date.now();
    timer = setTimeout(() => {
      timer = undefined;

      if (pending) {
        apply(pending.view);
      }

      advance();
    }, remaining);
  };

  const advance = () => {
    const next = steps.next();

    pending = next.done ? null : next.value;
    remaining = pending?.wait ?? 0;

    if (pending && playing) {
      schedule();
    }
  };

  return {
    play() {
      if (playing) {
        return;
      }

      playing = true;

      if (pending) {
        schedule();
      } else {
        advance();
      }
    },
    pause() {
      if (!playing) {
        return;
      }

      playing = false;

      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
        remaining = Math.max(0, remaining - (Date.now() - startedAt));
      }
    },
    get playing() {
      return playing;
    },
  };
};
