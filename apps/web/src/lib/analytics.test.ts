import { describe, expect, it } from 'vitest';

import {
  bucketDaily,
  dayLabel,
  hostnameOf,
  inboxHref,
  labelIndexes,
  niceTicks,
  parseConversationFilter,
  parseDays,
  parseInboxTab,
  percentage,
  periodStart,
} from './analytics';

const NOW = new Date('2026-09-23T15:30:00Z');

describe('parseDays', () => {
  it('accepts the supported periods and falls back to 30', () => {
    expect(parseDays('7')).toBe(7);
    expect(parseDays('30')).toBe(30);
    expect(parseDays(['7', '30'])).toBe(7);
    expect(parseDays('90')).toBe(30);
    expect(parseDays('abc')).toBe(30);
    expect(parseDays(undefined)).toBe(30);
  });
});

describe('periodStart', () => {
  it('starts at midnight UTC so the range ends with today', () => {
    expect(periodStart(7, NOW).toISOString()).toBe('2026-09-17T00:00:00.000Z');
    expect(periodStart(30, NOW).toISOString()).toBe('2026-08-25T00:00:00.000Z');
    expect(periodStart(1, NOW).toISOString()).toBe('2026-09-23T00:00:00.000Z');
  });
});

describe('percentage', () => {
  it('rounds to a whole number and survives an empty total', () => {
    expect(percentage(1, 3)).toBe(33);
    expect(percentage(2, 3)).toBe(67);
    expect(percentage(5, 5)).toBe(100);
    expect(percentage(0, 0)).toBe(0);
    expect(percentage(3, 0)).toBe(0);
    expect(percentage(-1, 10)).toBe(0);
  });
});

describe('dayLabel', () => {
  it('names the day in UTC to match the buckets', () => {
    expect(dayLabel('2026-09-03')).toBe('Sep 3');
    expect(dayLabel(new Date('2026-12-25T00:00:00Z'))).toBe('Dec 25');
    expect(dayLabel('not a date')).toBe('');
  });
});

describe('bucketDaily', () => {
  it('fills every day of the range with zeros where nothing happened', () => {
    const since = periodStart(5, NOW);
    const rows = bucketDaily(
      [
        { day: '2026-09-20', questions: 3, answered: 2, unanswered: 1 },
        { day: '2026-09-23', questions: 1, answered: 1, unanswered: 0 },
      ],
      since,
      5,
    );

    expect(rows.map((row) => row.day)).toEqual([
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
    ]);
    expect(rows[1]).toEqual({ day: '2026-09-20', questions: 3, answered: 2, unanswered: 1 });
    expect(rows[2]).toEqual({ day: '2026-09-21', questions: 0, answered: 0, unanswered: 0 });
    expect(rows[4]).toEqual({ day: '2026-09-23', questions: 1, answered: 1, unanswered: 0 });
  });

  it('ignores rows outside the range and tolerates timestamps as keys', () => {
    const rows = bucketDaily(
      [{ day: '2026-09-23T00:00:00+00:00', questions: '4' as unknown as number, answered: 4, unanswered: 0 }],
      periodStart(2, NOW),
      2,
    );

    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ day: '2026-09-23', questions: 4, answered: 4, unanswered: 0 });
    expect(bucketDaily([], periodStart(3, NOW), 0)).toEqual([]);
  });
});

describe('niceTicks', () => {
  it('produces clean rounded ticks', () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(5)).toEqual([0, 3, 6]);
    expect(niceTicks(7)).toEqual([0, 4, 8]);
    expect(niceTicks(12)).toEqual([0, 10, 20]);
    expect(niceTicks(43)).toEqual([0, 25, 50]);
    expect(niceTicks(130)).toEqual([0, 75, 150]);
    expect(niceTicks(180)).toEqual([0, 100, 200]);
    expect(niceTicks(1000)).toEqual([0, 500, 1000]);
  });
});

describe('labelIndexes', () => {
  it('labels every day when there is room and thins out when there is not', () => {
    expect(labelIndexes(7, 700)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(labelIndexes(30, 700)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 29]);
    expect(labelIndexes(0, 700)).toEqual([]);
  });

  it('keeps the first and last day readable on a phone', () => {
    const narrow = labelIndexes(30, 320);

    expect(narrow[0]).toBe(0);
    expect(narrow[narrow.length - 1]).toBe(29);
    expect(narrow.length).toBeLessThanOrEqual(8);

    // No two labels sit closer than the gap, including the last one.
    const slot = 320 / 30;
    narrow.forEach((index, position) => {
      const next = narrow[position + 1];

      if (next !== undefined) {
        expect((next - index) * slot).toBeGreaterThanOrEqual(44);
      }
    });
  });
});

describe('hostnameOf', () => {
  it('extracts the host and rejects non-urls', () => {
    expect(hostnameOf('https://docs.example.com/guides/auth?x=1')).toBe('docs.example.com');
    expect(hostnameOf('not a url')).toBeNull();
    expect(hostnameOf(null)).toBeNull();
    expect(hostnameOf('')).toBeNull();
  });
});

describe('search param parsers', () => {
  it('only accepts known filters and tabs', () => {
    expect(parseConversationFilter('widget')).toBe('widget');
    expect(parseConversationFilter('unanswered')).toBe('unanswered');
    expect(parseConversationFilter('nope')).toBe('all');
    expect(parseConversationFilter(undefined)).toBe('all');
    expect(parseInboxTab('leads')).toBe('leads');
    expect(parseInboxTab(['leads'])).toBe('leads');
    expect(parseInboxTab('other')).toBe('conversations');
  });

  it('builds inbox links without default params', () => {
    expect(inboxHref('a1', 'conversations')).toBe('/a/a1/inbox');
    expect(inboxHref('a1', 'conversations', 'widget')).toBe('/a/a1/inbox?filter=widget');
    expect(inboxHref('a1', 'leads')).toBe('/a/a1/inbox?tab=leads');
    expect(inboxHref('a1', 'leads', 'widget')).toBe('/a/a1/inbox?tab=leads');
  });
});
