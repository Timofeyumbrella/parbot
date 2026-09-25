import { describe, expect, it } from 'vitest';

import { UNANSWERED_TEXT } from '@/lib/engine/prompt';

import { DEMO_SCENES, splitCitationMarkers } from './demo-script';

describe('splitCitationMarkers', () => {
  it('splits text around single and grouped markers', () => {
    expect(splitCitationMarkers('Open Settings [1]. Then rotate [1, 2].')).toEqual([
      { type: 'text', text: 'Open Settings ' },
      { type: 'citation', index: 1 },
      { type: 'text', text: '. Then rotate ' },
      { type: 'citation', index: 1 },
      { type: 'citation', index: 2 },
      { type: 'text', text: '.' },
    ]);
  });

  it('returns plain text untouched', () => {
    expect(splitCitationMarkers('No markers here.')).toEqual([
      { type: 'text', text: 'No markers here.' },
    ]);
    expect(splitCitationMarkers('')).toEqual([]);
  });
});

describe('DEMO_SCENES', () => {
  it('cites every marker it uses and shows the honest refusal once', () => {
    for (const scene of DEMO_SCENES) {
      const indexes = splitCitationMarkers(scene.answer)
        .filter((segment) => segment.type === 'citation')
        .map((segment) => segment.index);

      for (const index of indexes) {
        expect(
          scene.citations.some((citation) => citation.index === index),
          `${scene.question} [${index}]`,
        ).toBe(true);
      }
    }

    const unanswered = DEMO_SCENES.filter((scene) => scene.unanswered);

    expect(unanswered).toHaveLength(1);
    expect(unanswered[0]?.answer).toBe(UNANSWERED_TEXT);
    expect(unanswered[0]?.citations).toEqual([]);
  });
});
