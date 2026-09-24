import type { ChatErrorCode, ChatStreamEvent } from '@parbot/shared';

/**
 * Copy for the ways a send can fail. Nothing here echoes a browser or library message: the
 * reader gets a sentence that says what happened and what to try.
 */

export type ChatError = { code: ChatErrorCode; message: string };

export const NETWORK_FAILURE: ChatError = {
  code: 'internal',
  message: 'The message did not reach the server. Check your connection and try again.',
};

export const STREAM_CUT_SHORT: ChatError = {
  code: 'internal',
  message: 'The connection closed before the answer finished. Try again.',
};

/** For a response that is not an event stream, which our route never sends: a proxy or a crash answered instead. */
export const httpFailure = (status: number): ChatError => {
  if (status === 401 || status === 403) {
    return { code: 'unauthorized', message: 'Your session has ended. Sign in again to keep chatting.' };
  }

  if (status === 404) {
    return { code: 'not_found', message: 'This assistant is no longer available.' };
  }

  if (status === 429) {
    return { code: 'rate_limited', message: 'Too many messages in a short time. Wait a moment and try again.' };
  }

  if (status >= 500) {
    return { code: 'internal', message: `The server could not answer (${status}). Try again in a moment.` };
  }

  return { code: 'internal', message: `The server refused the message (${status}). Try again.` };
};

export type ErrorAction = { href: string; label: string };

/** Where an error bubble can send the reader, when there is somewhere useful to go. */
export const errorAction = (error: ChatError): ErrorAction | null => {
  switch (error.code) {
    case 'quota_exceeded':
      return { href: '/billing', label: 'Upgrade in Billing' };
    case 'unauthorized':
      return { href: '/login', label: 'Sign in' };
    default:
      return null;
  }
};

/** Whether sending the same message again can reasonably succeed. */
export const canRetry = (error: ChatError) => error.code !== 'unauthorized' && error.code !== 'not_found';

export const errorEvent = (error: ChatError): ChatStreamEvent => ({ type: 'error', ...error });
