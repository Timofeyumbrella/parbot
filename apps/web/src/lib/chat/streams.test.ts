import { beforeEach, describe, expect, it, vi } from 'vitest';

import { streamRegistry } from './streams';

beforeEach(() => {
  streamRegistry.reset();
});

describe('streamRegistry', () => {
  it('tracks one controller per conversation and tells subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = streamRegistry.subscribe(listener);
    const controller = streamRegistry.start('c1');

    expect(streamRegistry.isStreaming('c1')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    streamRegistry.finish('c1', controller);
    expect(streamRegistry.isStreaming('c1')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    streamRegistry.start('c1');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('starting again aborts the stream already running for that conversation', () => {
    const first = streamRegistry.start('c1');
    const second = streamRegistry.start('c1');

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);

    // Finishing the stale one must not forget the live one.
    streamRegistry.finish('c1', first);
    expect(streamRegistry.isStreaming('c1')).toBe(true);
  });

  it('remembers which answer a stream is writing until it finishes or stops', () => {
    const target = { assistantId: 'a1', messageId: 'm1' };
    const controller = streamRegistry.start('c1', target);

    expect(streamRegistry.target('c1')).toEqual(target);
    expect(streamRegistry.target('c2')).toBeNull();

    streamRegistry.finish('c1', controller);
    expect(streamRegistry.target('c1')).toBeNull();

    streamRegistry.start('c1', target);
    streamRegistry.stop('c1');
    expect(streamRegistry.target('c1')).toBeNull();
  });

  it('stop aborts and reports whether anything was running', () => {
    const controller = streamRegistry.start('c1');

    expect(streamRegistry.stop('c1')).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(streamRegistry.isStreaming('c1')).toBe(false);
    expect(streamRegistry.stop('c1')).toBe(false);
  });
});
