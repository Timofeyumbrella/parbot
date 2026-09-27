// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { buildSystemPrompt, renderQuestion } from './prompt';
import {
  readingMessage,
  type ReferencedSource,
  resolveReferences,
  waitForReferences,
} from './references';
import { mergeReferenced, type RetrievedChunk, type ServiceClient, trimToBudget } from './retrieval';

const chunk = (id: string, patch: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  chunkId: id,
  documentId: `d-${id}`,
  documentTitle: `Doc ${id}`,
  documentUrl: null,
  heading: null,
  content: `Passage ${id}.`,
  similarity: 0.5,
  ...patch,
});

const source = (id: string, patch: Partial<ReferencedSource> = {}): ReferencedSource => ({
  id,
  title: `${id}.md`,
  kind: 'upload',
  status: 'ready',
  ...patch,
});

describe('the prompt with references', () => {
  it('names the referenced files and says what "this file" means', () => {
    const one = buildSystemPrompt({ name: 'Docs', instructions: null }, ['limits.md']);
    const two = buildSystemPrompt({ name: 'Docs', instructions: 'Be brief.' }, [
      'limits.md',
      'Refund policy',
    ]);

    expect(one).toContain('The reader pointed at this file for this conversation: "limits.md".');
    expect(one).toContain('"this file", "the document", "it" or similar, it means that file.');
    expect(two).toContain('these files for this conversation: "limits.md", "Refund policy".');
    // The team's own instructions still come last.
    expect(two.trim().endsWith('Be brief.')).toBe(true);
  });

  it('says nothing about references when there are none', () => {
    expect(buildSystemPrompt({ name: 'Docs', instructions: null })).not.toContain('pointed at');
  });

  it('marks passages from referenced files in the sources list', () => {
    const text = renderQuestion('What does it say?', [
      chunk('a', { documentTitle: 'limits.md', heading: 'Quotas', referenced: true }),
      chunk('b', { documentTitle: 'Webhooks', documentUrl: 'https://docs.test/webhooks' }),
    ]);

    expect(text).toContain('[1] limits.md › Quotas (referenced)\nPassage a.');
    expect(text).toContain('[2] Webhooks\nURL: https://docs.test/webhooks\nPassage b.');
  });
});

describe('mergeReferenced', () => {
  it('puts referenced passages first and lists each passage once', () => {
    const merged = mergeReferenced(
      [chunk('r1', { referenced: true }), chunk('r2', { referenced: true })],
      [chunk('m1'), chunk('r2'), chunk('m2')],
    );

    expect(merged.map((item) => item.chunkId)).toEqual(['r1', 'r2', 'm1', 'm2']);
    expect(merged[1]!.referenced).toBe(true);
  });

  it('keeps referenced passages when the budget runs out', () => {
    const long = 'x'.repeat(5000);
    const kept = trimToBudget(
      mergeReferenced(
        [chunk('r1', { content: long }), chunk('r2', { content: long })],
        [chunk('m1', { content: long })],
      ),
    );

    expect(kept.map((item) => item.chunkId)).toEqual(['r1', 'r2']);
  });
});

describe('readingMessage', () => {
  it('names the file, or the first and how many more', () => {
    expect(readingMessage([{ title: 'guide.pdf' }])).toBe('Reading guide.pdf…');
    expect(readingMessage([{ title: 'guide.pdf' }, { title: 'a.md' }, { title: 'b.md' }])).toBe(
      'Reading guide.pdf and 2 more…',
    );
  });
});

/** A service whose `sources` reads answer from `statuses`, one entry per poll. */
const pollingService = (statuses: Record<string, string>[]) => {
  let poll = 0;
  const reads: string[][] = [];

  const service = {
    from: () => ({
      select: () => ({
        in: (_column: string, ids: string[]) => {
          reads.push(ids);

          const current = statuses[Math.min(poll, statuses.length - 1)]!;

          poll += 1;

          return Promise.resolve({
            data: ids.flatMap((id) => (current[id] ? [{ id, status: current[id] }] : [])),
            error: null,
          });
        },
      }),
    }),
  } as unknown as ServiceClient;

  return { service, reads };
};

describe('waitForReferences', () => {
  it('returns once every referenced source has finished, reading only the ones still going', async () => {
    const { service, reads } = pollingService([
      { a: 'indexing', b: 'indexing' },
      { a: 'ready', b: 'failed' },
    ]);
    const result = await waitForReferences(
      service,
      [source('a', { status: 'queued' }), source('b', { status: 'indexing' }), source('c')],
      { timeoutMs: 5_000, pollMs: 1 },
    );

    expect(result.map((item) => item.status)).toEqual(['ready', 'failed', 'ready']);
    expect(reads).toEqual([['a', 'b'], ['a', 'b']]);
  });

  it('gives up at the deadline and keeps the last status it saw', async () => {
    const { service } = pollingService([{ a: 'indexing' }]);
    const startedAt = Date.now();
    const result = await waitForReferences(service, [source('a', { status: 'queued' })], {
      timeoutMs: 60,
      pollMs: 10,
    });

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(result[0]!.status).toBe('indexing');
  });

  it('stops waiting as soon as the reader stops the answer', async () => {
    const { service } = pollingService([{ a: 'indexing' }]);
    const controller = new AbortController();

    setTimeout(() => controller.abort(), 20);

    const startedAt = Date.now();

    await waitForReferences(service, [source('a', { status: 'queued' })], {
      timeoutMs: 10_000,
      pollMs: 5_000,
      signal: controller.signal,
    });

    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it('treats a source deleted while waiting as having nothing to read', async () => {
    const { service } = pollingService([{}]);
    const result = await waitForReferences(service, [source('a', { status: 'queued' })], {
      timeoutMs: 1_000,
      pollMs: 1,
    });

    expect(result[0]!.status).toBe('failed');
  });
});

describe('resolveReferences', () => {
  it('reads nothing for a new conversation that sent no references', async () => {
    const from = vi.fn();
    const result = await resolveReferences({ from } as unknown as ServiceClient, {
      assistantId: 'a',
      ownerId: 'o',
      conversationId: 'c',
      requested: undefined,
      existing: false,
    });

    expect(result).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('answers without references when they cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({ data: null, error: { message: 'timeout' } }),
          }),
        }),
      }),
    } as unknown as ServiceClient;

    const result = await resolveReferences(failing, {
      assistantId: 'a',
      ownerId: 'o',
      conversationId: 'c',
      requested: ['s1'],
      existing: true,
    });

    expect(result).toEqual([]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
