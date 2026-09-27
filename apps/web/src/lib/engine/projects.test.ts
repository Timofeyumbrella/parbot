// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { buildSystemPrompt, NO_ANSWER } from './prompt';
import { MAX_CONTEXT_SOURCES, mergeContextSources } from './projects';
import type { ReferencedSource } from './references';

const source = (id: string): ReferencedSource => ({
  id,
  title: `${id}.md`,
  kind: 'upload',
  status: 'ready',
});

describe('mergeContextSources', () => {
  it("puts the conversation's own references first, then the project's files, each once", () => {
    const merged = mergeContextSources(
      [source('mine'), source('shared')],
      [source('shared'), source('pricing'), source('faq')],
    );

    expect(merged.map((item) => item.id)).toEqual(['mine', 'shared', 'pricing', 'faq']);
  });

  it('stops at the cap', () => {
    const project = Array.from({ length: 30 }, (_, index) => source(`p${index}`));
    const merged = mergeContextSources([source('mine')], project);

    expect(merged).toHaveLength(MAX_CONTEXT_SOURCES);
    expect(merged[0]!.id).toBe('mine');
  });
});

describe('the prompt in a project', () => {
  const assistant = { name: 'Docs', instructions: 'Answer in a friendly tone.' };
  const project = {
    name: 'Billing',
    instructions: 'Focus on invoices and refunds.',
    titles: ['Pricing sheet'],
  };

  it("names the project and its files, and says what 'this file' means when nothing was picked", () => {
    const prompt = buildSystemPrompt(assistant, [], project);

    expect(prompt).toContain('This conversation belongs to the project "Billing".');
    expect(prompt).toContain(
      `The project's file is "Pricing sheet"; sources taken from it are marked (referenced). Prefer them.`,
    );
    expect(prompt).toContain(`it means the project's file.`);
  });

  it("leaves 'this file' to the reader's own picks when there are some", () => {
    const prompt = buildSystemPrompt(assistant, ['limits.md'], project);

    expect(prompt).toContain('The reader pointed at this file for this conversation: "limits.md".');
    expect(prompt).not.toContain(`it means the project's file`);
  });

  it("adds the project's instructions after the assistant's own, labelled, under the rules", () => {
    const prompt = buildSystemPrompt(assistant, [], project);
    const own = prompt.indexOf('Additional instructions from the team:');
    const label = prompt.indexOf('Project instructions from the team, for conversations in "Billing".');
    const rule = prompt.indexOf('Answer only from those sources.');

    expect(rule).toBeGreaterThanOrEqual(0);
    expect(own).toBeGreaterThan(rule);
    expect(label).toBeGreaterThan(own);
    // The label restates that the project cannot lift the rules.
    expect(prompt.slice(label)).toContain(
      `never override the rules above: answer only from the sources, and reply with exactly ${NO_ANSWER}`,
    );
    expect(prompt.trim().endsWith('Focus on invoices and refunds.')).toBe(true);
  });

  it('says nothing about instructions a project does not have', () => {
    const prompt = buildSystemPrompt(assistant, [], { ...project, instructions: '  ' });

    expect(prompt).not.toContain('Project instructions');
    expect(prompt).toContain('This conversation belongs to the project "Billing".');
  });

  it('says nothing about projects outside one', () => {
    expect(buildSystemPrompt(assistant)).not.toContain('project');
  });
});
