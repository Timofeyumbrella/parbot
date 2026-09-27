import { describe, expect, it } from 'vitest';

import { formatDuration } from './format';

describe('formatDuration', () => {
  it('reads as precise as it is useful', () => {
    expect(formatDuration(0)).toBe('0 ms');
    expect(formatDuration(850.4)).toBe('850 ms');
    expect(formatDuration(1000)).toBe('1.0 s');
    expect(formatDuration(1420)).toBe('1.4 s');
    expect(formatDuration(9949)).toBe('9.9 s');
    expect(formatDuration(9950)).toBe('10 s');
    expect(formatDuration(12_400)).toBe('12 s');
    expect(formatDuration(59_600)).toBe('1 min');
    expect(formatDuration(95_330)).toBe('1 min 35 s');
    expect(formatDuration(-5)).toBe('0 ms');
  });
});
