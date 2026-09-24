import { describe, expect, it } from 'vitest';

import { formatLatency, hostnameOf, relativeTime } from './format';

describe('relativeTime', () => {
  const now = Date.parse('2026-09-23T12:00:00Z');

  it('rounds down to the largest unit', () => {
    expect(relativeTime('2026-09-23T11:59:40Z', now)).toBe('now');
    expect(relativeTime('2026-09-23T11:35:00Z', now)).toBe('25m');
    expect(relativeTime('2026-09-23T07:00:00Z', now)).toBe('5h');
    expect(relativeTime('2026-09-20T12:00:00Z', now)).toBe('3d');
    expect(relativeTime('2026-08-01T12:00:00Z', now)).toBe('Aug 1');
    expect(relativeTime('2025-08-01T12:00:00Z', now)).toBe('Aug 1, 2025');
  });

  it('is empty for missing or broken input', () => {
    expect(relativeTime(null, now)).toBe('');
    expect(relativeTime('not a date', now)).toBe('');
  });
});

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
