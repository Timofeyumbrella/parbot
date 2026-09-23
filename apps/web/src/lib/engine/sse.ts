import { type ChatStreamEvent, encodeSseEvent } from '@parbot/shared';

export const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
} as const;

/**
 * Turns an event generator into a streaming Response. A leading comment flushes headers so the
 * client sees bytes before the first token. If the generator throws, the client gets an error
 * event rather than a dropped connection.
 */
export const streamResponse = (
  events: AsyncGenerator<ChatStreamEvent>,
  init?: { headers?: HeadersInit; status?: number },
) => {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(': ok\n\n'));

      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(encodeSseEvent(event)));
        }
      } catch (cause) {
        controller.enqueue(
          encoder.encode(
            encodeSseEvent({
              type: 'error',
              code: 'internal',
              message: cause instanceof Error ? cause.message : 'The stream failed.',
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
      void events.return(undefined);
    },
  });

  const headers = new Headers(init?.headers);

  for (const [name, value] of Object.entries(SSE_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(body, { status: init?.status ?? 200, headers });
};

/** A one-event stream for failures that happen before anything can be answered. */
export const errorStream = async function* (event: ChatStreamEvent): AsyncGenerator<ChatStreamEvent> {
  yield event;
};
