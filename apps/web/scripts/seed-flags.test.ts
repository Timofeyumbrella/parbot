// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { parseSeedFlags } from './seed-flags';

describe('parseSeedFlags', () => {
  it('reads each option, none of them on by default', () => {
    expect(parseSeedFlags([])).toEqual({
      history: false,
      refreshHistory: false,
      reset: false,
      writeEnv: false,
    });
    expect(parseSeedFlags(['--refresh-history', '--write-env'])).toEqual({
      history: false,
      refreshHistory: true,
      reset: false,
      writeEnv: true,
    });
    expect(parseSeedFlags(['--history', '--reset'])).toMatchObject({ history: true, reset: true });
  });

  it('refuses --refresh-history with --reset, which would delete the key it keeps', () => {
    expect(() => parseSeedFlags(['--reset', '--refresh-history'])).toThrow(
      /--refresh-history keeps the demo assistant and its public key, and --reset deletes them/,
    );
  });

  it('refuses an unknown option instead of silently doing less', () => {
    expect(() => parseSeedFlags(['--refresh'])).toThrow(/Unknown option --refresh\./);
  });
});
