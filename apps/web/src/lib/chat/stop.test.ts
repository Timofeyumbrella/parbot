import { MAX_STOP_TEXT_LENGTH } from '@parbot/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { recordStop, STOP_RETRY_MS } from './stop';

const input = {
  assistantId: '11111111-1111-4111-8111-111111111111',
  conversationId: '22222222-2222-4222-8222-222222222222',
  messageId: '33333333-3333-4333-8333-333333333333',
  text: 'API keys are',
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('recordStop', () => {
  it('posts the shown text for the answer it names, as a request that can outlive the page', async () => {
    const fetch = vi.fn(async () => Response.json({ stopped: true }));

    vi.stubGlobal('fetch', fetch);

    await expect(recordStop(input)).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      `/api/messages/${input.messageId}/stop`,
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];

    expect(JSON.parse(init.body as string)).toEqual({
      assistantId: input.assistantId,
      conversationId: input.conversationId,
      text: 'API keys are',
    });
  });

  it('tries once more after a network failure or a server error', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json({ stopped: true }));

    vi.stubGlobal('fetch', fetch);

    const pending = recordStop(input);

    await vi.advanceTimersByTimeAsync(STOP_RETRY_MS);
    await expect(pending).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);

    const failing = vi.fn(async () => new Response('busy', { status: 503 }));

    vi.stubGlobal('fetch', failing);

    const again = recordStop(input);

    await vi.advanceTimersByTimeAsync(STOP_RETRY_MS);
    await expect(again).resolves.toBe(false);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('takes a refusal as final', async () => {
    const fetch = vi.fn(async () => Response.json({ error: 'nope' }, { status: 404 }));

    vi.stubGlobal('fetch', fetch);

    await expect(recordStop(input)).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('cuts a very long text to the limit, which still leaves a prefix of the answer', async () => {
    const fetch = vi.fn(async () => Response.json({ stopped: true }));

    vi.stubGlobal('fetch', fetch);

    await recordStop({ ...input, text: 'x'.repeat(MAX_STOP_TEXT_LENGTH + 50) });

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];

    expect((JSON.parse(init.body as string) as { text: string }).text).toHaveLength(
      MAX_STOP_TEXT_LENGTH,
    );
  });
});
