import { describe, expect, it } from 'vitest';

import { formatDuration, plural, pluralWord } from './format';

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

describe('plural', () => {
  it('agrees with one and with every other count, zero included', () => {
    expect(plural(1, 'rating')).toBe('1 rating');
    expect(plural(0, 'rating')).toBe('0 ratings');
    expect(plural(2, 'rating')).toBe('2 ratings');
    expect(plural(1204, 'answer')).toBe('1,204 answers');
    expect(plural(1, 'pt', 'pts')).toBe('1 pt');
    expect(plural(3, 'reply', 'replies')).toBe('3 replies');
  });

  it('picks the verb that agrees with a count', () => {
    // Regression: the Overview read "1 of 1 rating were a thumb up".
    expect(`1 of ${plural(1, 'rating')} ${pluralWord(1, 'was', 'were')} a thumb up`).toBe(
      '1 of 1 rating was a thumb up',
    );
    expect(pluralWord(0, 'was', 'were')).toBe('were');
    expect(pluralWord(2, 'was', 'were')).toBe('were');
    expect(pluralWord(1, 'page')).toBe('page');
    expect(pluralWord(5, 'page')).toBe('pages');
  });
});
