import { UNANSWERED_TEXT } from '@/lib/engine/prompt';

import type { DemoCitation } from './demo-window';

export type DemoScene = {
  question: string;
  answer: string;
  citations: DemoCitation[];
  /** The docs did not cover it: the demo shows the honest refusal and the lead capture. */
  unanswered?: boolean;
};

export const DEMO_ASSISTANT_NAME = 'Acme Docs';

/** A fictional product's docs, so no claim here is about a real company. */
export const DEMO_SCENES: DemoScene[] = [
  {
    question: 'How do I rotate an API key?',
    answer:
      'Open Settings, then API keys, and choose Rotate next to the key [1]. The old key keeps working for 24 hours so deployed services can switch over without a gap [1].',
    citations: [
      { index: 1, title: 'Authentication › API keys', url: 'https://docs.acme.dev/auth/api-keys' },
    ],
  },
  {
    question: 'Does the SDK run on Deno?',
    answer: UNANSWERED_TEXT,
    citations: [],
    unanswered: true,
  },
  {
    question: 'How do I verify a webhook signature?',
    answer:
      'Compute an HMAC-SHA256 of the raw request body with your signing secret and compare it to the X-Acme-Signature header using a constant-time comparison [1]. Reject deliveries whose timestamp is older than five minutes [2].',
    citations: [
      {
        index: 1,
        title: 'Webhooks › Verifying signatures',
        url: 'https://docs.acme.dev/webhooks/verify',
      },
      {
        index: 2,
        title: 'Webhooks › Replay protection',
        url: 'https://docs.acme.dev/webhooks/replay',
      },
    ],
  },
];

export const DEMO_TIMING = {
  /** Per character while the question is typed into the input. */
  keystrokeMs: 38,
  /** After the question is complete, before it is sent. */
  beforeSendMs: 500,
  /** Between sending and the first word of the answer. */
  thinkMs: 700,
  /** Per word while the answer streams. */
  wordMs: 55,
  /** Between the citations appearing and the next scene. */
  holdMs: 5200,
} as const;

export type DemoSegment = { type: 'text'; text: string } | { type: 'citation'; index: number };

/** Splits an answer around its [n] markers so each marker can be rendered as a chip. */
export const splitCitationMarkers = (text: string): DemoSegment[] => {
  const segments: DemoSegment[] = [];
  const pattern = /\[(\d{1,2})(?:\s*,\s*(\d{1,2}))*\]/g;
  let last = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index > last) {
      segments.push({ type: 'text', text: text.slice(last, match.index) });
    }

    for (const part of match[0].slice(1, -1).split(',')) {
      segments.push({ type: 'citation', index: Number(part.trim()) });
    }

    last = match.index + match[0].length;
  }

  if (last < text.length) {
    segments.push({ type: 'text', text: text.slice(last) });
  }

  return segments;
};
