// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { citationsWithin, shownPart, type StopRecord, watchForStop } from './stops';

afterEach(() => {
  vi.useRealTimers();
});

describe('shownPart', () => {
  it('keeps what the reader saw of the answer', () => {
    expect(shownPart('API keys are created in Settings. [1]', 'API keys are ')).toBe(
      'API keys are',
    );
    expect(shownPart('  API keys', 'API keys')).toBe('API keys');
    expect(shownPart('All of it.', 'All of it.')).toBe('All of it.');
    expect(shownPart('Anything', '')).toBe('');
  });

  it('never keeps words the assistant did not send', () => {
    expect(shownPart('API keys are created', 'API keys were never')).toBe('API keys');
    expect(shownPart('Short', 'Short and then some invented text')).toBe('Short');
  });

  it('does not end on half of a character', () => {
    // The two differ in the second half of a surrogate pair.
    expect(shownPart('Hi \u{1F600}', 'Hi \u{1F601}')).toBe('Hi');
  });
});

describe('citationsWithin', () => {
  const citations = [
    { index: 1, documentId: 'd1', title: 'Auth', url: null, snippet: 'a' },
    { index: 3, documentId: 'd2', title: 'Hooks', url: null, snippet: 'b' },
  ];

  it('keeps the citations the shortened text still cites', () => {
    expect(citationsWithin('Rotate keys [1]. Hooks are', citations)).toEqual([citations[0]]);
    expect(citationsWithin('Both [1, 3]', citations)).toEqual(citations);
    expect(citationsWithin('Cut in a marker [', citations)).toEqual([]);
  });

  it('reads anything that is not a list as no citations', () => {
    expect(citationsWithin('Rotate keys [1]', null)).toEqual([]);
  });
});

describe('watchForStop', () => {
  it('looks at once and then on its interval, and aborts when a stop turns up', async () => {
    vi.useFakeTimers();

    let stop: StopRecord | null = null;
    const read = vi.fn(async () => stop);
    const watch = watchForStop(read, 400);

    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    expect(watch.signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(399);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);

    stop = { content: 'shown' };
    await vi.advanceTimersByTimeAsync(400);
    expect(watch.signal.aborted).toBe(true);
    expect(watch.found).toEqual({ content: 'shown' });

    // Once found, nothing more is read, and a check answers from memory.
    await vi.advanceTimersByTimeAsync(2000);
    await expect(watch.check()).resolves.toEqual({ content: 'shown' });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('stops looking once disposed', async () => {
    vi.useFakeTimers();

    const read = vi.fn(async () => null);
    const watch = watchForStop(read, 400);

    await vi.advanceTimersByTimeAsync(0);
    watch.dispose();
    await vi.advanceTimersByTimeAsync(4000);

    expect(read).toHaveBeenCalledTimes(1);
    expect(watch.signal.aborted).toBe(false);
  });
});
