import { describe, expect, it } from 'vitest';

import { formatLatency, hostnameOf } from './format';

describe('formatLatency', () => {
  it('shows seconds with one decimal under ten', () => {
    expect(formatLatency(820)).toBe('0.8s');
    expect(formatLatency(2450)).toBe('2.5s');
    expect(formatLatency(12_400)).toBe('12s');
    expect(formatLatency(null)).toBe('');
  });
});

describe('hostnameOf', () => {
  it('strips www and survives junk', () => {
    expect(hostnameOf('https://www.docs.example.com/auth')).toBe('docs.example.com');
    expect(hostnameOf('not a url')).toBe('not a url');
    expect(hostnameOf(null)).toBeNull();
  });
});
