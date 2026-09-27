// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { buildSystemPrompt, COVERAGE_RULES, isRefusal, NO_ANSWER } from './prompt';

const assistant = { name: 'Docs', instructions: null };

describe('the prompt for questions the sources only partly cover', () => {
  const prompt = buildSystemPrompt(assistant);

  it('answers the part the sources cover and says briefly what they do not', () => {
    expect(prompt).toContain(
      'When the sources answer only part of the question, answer that part, then say in one short sentence what the documentation does not cover.',
    );
    expect(prompt).toContain(
      'When the question asks for more detail than the sources hold, give all the detail they do hold.',
    );
  });

  it('combines sources that answer the question together', () => {
    expect(prompt).toContain(
      'When sources answer it together, combine them into one answer and cite each.',
    );
  });

  it('keeps the marker only for questions no source answers any part of', () => {
    expect(prompt).toContain(
      `Reply with exactly ${NO_ANSWER} and nothing else only when the sources answer no part of the question.`,
    );
    expect(prompt).toContain('Sources on a related topic that answer no part of it do not count.');
    expect(prompt).toContain(`Never write ${NO_ANSWER} inside an answer.`);
    // The old rule refused any question whose whole answer was not in the sources.
    expect(prompt).not.toContain('If the sources do not contain the answer');
  });

  it('still forbids anything the sources do not support, examples included', () => {
    expect(prompt).toContain('Answer only from those sources.');
    expect(prompt).toContain(
      'Never invent anything the sources do not support: no endpoints, functions, flags, options, prices, limits or URLs they do not show.',
    );
    expect(prompt).toContain(
      'A code sample or worked example may use only what the sources show; when they give nothing to build one from, say so instead of making one up.',
    );
  });

  it('puts the coverage rules before the team instructions, which cannot lift them', () => {
    const withTeam = buildSystemPrompt({ name: 'Docs', instructions: 'Always answer something.' });
    const rules = COVERAGE_RULES.map((rule) => withTeam.indexOf(rule));
    const team = withTeam.indexOf('Additional instructions from the team:');

    expect(rules.every((index) => index >= 0 && index < team)).toBe(true);
  });

  it('restates the same refusal rule above project instructions', () => {
    const inProject = buildSystemPrompt(assistant, [], {
      name: 'Billing',
      instructions: 'Focus on refunds.',
      titles: [],
    });

    expect(inProject).toContain(
      `answer only from the sources, and reply with exactly ${NO_ANSWER} only when the sources answer no part of the question.`,
    );
  });
});

describe('isRefusal', () => {
  it('is the marker alone, whatever the case and spacing', () => {
    expect(isRefusal(NO_ANSWER)).toBe(true);
    expect(isRefusal('  no_answer\n')).toBe(true);
  });

  it('is not a partial answer that names what the documentation leaves out', () => {
    expect(
      isRefusal(
        'Rotate a key from Settings [1]. The documentation does not cover automatic expiry.',
      ),
    ).toBe(false);
  });
});
