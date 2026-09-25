import { describe, expect, it } from 'vitest';

import {
  canRetry,
  errorAction,
  fromServerError,
  httpFailure,
  NETWORK_FAILURE,
  STREAM_CUT_SHORT,
} from './errors';

describe('httpFailure', () => {
  it('maps status codes to sentences that say what to do', () => {
    expect(httpFailure(500).message).toBe(
      'The server could not answer (500). Try again in a moment.',
    );
    expect(httpFailure(502).message).toContain('502');
    expect(httpFailure(401)).toMatchObject({ code: 'unauthorized' });
    expect(httpFailure(404)).toMatchObject({ code: 'not_found' });
    expect(httpFailure(429)).toMatchObject({ code: 'rate_limited' });
    expect(httpFailure(418)).toMatchObject({
      code: 'internal',
      message: expect.stringContaining('418'),
    });
  });

  it('never echoes browser error text', () => {
    expect(NETWORK_FAILURE.message).not.toMatch(/fetch/i);
    expect(STREAM_CUT_SHORT.message).toMatch(/Try again/);
  });
});

describe('errorAction', () => {
  it('points a quota error at Billing and a session error at sign in', () => {
    expect(errorAction({ code: 'quota_exceeded', message: '' })).toEqual({
      href: '/billing',
      label: 'Upgrade in Billing',
    });
    expect(errorAction({ code: 'unauthorized', message: '' })).toEqual({
      href: '/login',
      label: 'Sign in',
    });
    expect(errorAction({ code: 'internal', message: '' })).toBeNull();
  });

  it('offers a retry unless the reader cannot fix it by resending', () => {
    expect(canRetry({ code: 'rate_limited', message: '' })).toBe(true);
    expect(canRetry({ code: 'quota_exceeded', message: '' })).toBe(true);
    expect(canRetry({ code: 'unauthorized', message: '' })).toBe(false);
    expect(canRetry({ code: 'not_found', message: '' })).toBe(false);
  });
});

describe('fromServerError', () => {
  it('replaces provider and database text with a fixed sentence', () => {
    expect(
      fromServerError({
        type: 'error',
        code: 'internal',
        message: 'relation "chunks" does not exist',
      }),
    ).toEqual({
      code: 'internal',
      message: 'The answer could not be produced. Try again in a moment.',
    });
    expect(
      fromServerError({
        type: 'error',
        code: 'model_busy',
        message: 'The models gemini-x are busy',
      }).message,
    ).not.toMatch(/gemini/);
  });

  it('keeps the copy the route wrote for the other codes', () => {
    const quota = {
      type: 'error',
      code: 'quota_exceeded',
      message: 'This account has used its 200 answers for the month.',
    } as const;

    expect(fromServerError(quota)).toEqual({ code: 'quota_exceeded', message: quota.message });
  });
});
