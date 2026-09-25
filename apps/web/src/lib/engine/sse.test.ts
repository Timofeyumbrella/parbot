// @vitest-environment node
import { readChatStream } from '@parbot/shared';
import { describe, expect, it, vi } from 'vitest';

import { streamResponse } from './sse';

describe('streamResponse', () => {
  it('turns a thrown error into a fixed error event, never the thrown text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const events = (async function* () {
      yield { type: 'token' as const, text: 'Half' };
      throw new Error('connect ECONNREFUSED 127.0.0.1:54322');
    })();

    const received = [];

    for await (const event of readChatStream(streamResponse(events))) {
      received.push(event);
    }

    expect(received).toEqual([
      { type: 'token', text: 'Half' },
      {
        type: 'error',
        code: 'internal',
        message: 'The answer could not be produced. Try again in a moment.',
      },
    ]);
    expect(console.error).toHaveBeenCalledWith('[engine] stream failed', expect.any(Error));
  });
});
