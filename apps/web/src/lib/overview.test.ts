import { describe, expect, it } from 'vitest';

import {
  answerRate,
  compare,
  contentWords,
  EMPTY_TOTALS,
  firstLine,
  type GapRow,
  groupGaps,
  helpfulness,
  pageLabel,
  previousPeriodStart,
  projectUsage,
  roundEstimate,
  trigramSimilarity,
  trigramsOf,
} from './overview';

const similarity = (a: string, b: string) => trigramSimilarity(trigramsOf(a), trigramsOf(b));

describe('previousPeriodStart', () => {
  it('starts the same number of days before the period does', () => {
    const since = new Date('2026-09-21T00:00:00Z');

    expect(previousPeriodStart(since, 7).toISOString()).toBe('2026-09-14T00:00:00.000Z');
    expect(previousPeriodStart(since, 30).toISOString()).toBe('2026-08-22T00:00:00.000Z');
  });
});

describe('answerRate and helpfulness', () => {
  it('divide the finished answers and the rated ones', () => {
    const totals = { ...EMPTY_TOTALS, answered: 41, unanswered: 9, positive: 3, negative: 1 };

    expect(answerRate(totals)).toEqual({ percent: 82, part: 41, whole: 50 });
    expect(helpfulness(totals)).toEqual({ percent: 75, part: 3, whole: 4 });
  });

  it('have no percentage when there is nothing to divide by', () => {
    expect(answerRate(EMPTY_TOTALS).percent).toBeNull();
    expect(helpfulness(EMPTY_TOTALS).percent).toBeNull();
    expect(helpfulness({ ...EMPTY_TOTALS, negative: 2 }).percent).toBe(0);
  });
});

describe('compare', () => {
  it('colours a rise good when higher is better and bad when lower is', () => {
    expect(compare(82, 76, { higherIsBetter: true })).toEqual({
      direction: 'up',
      amount: 6,
      tone: 'good',
    });
    expect(compare(70, 76, { higherIsBetter: true })).toEqual({
      direction: 'down',
      amount: 6,
      tone: 'bad',
    });
    expect(compare(1800, 1200, { higherIsBetter: false })).toEqual({
      direction: 'up',
      amount: 600,
      tone: 'bad',
    });
    expect(compare(900, 1200, { higherIsBetter: false })).toEqual({
      direction: 'down',
      amount: 300,
      tone: 'good',
    });
  });

  it('reads a move within the tolerance as flat and neutral', () => {
    expect(compare(80, 80, { higherIsBetter: true })).toEqual({
      direction: 'flat',
      amount: 0,
      tone: 'neutral',
    });
    expect(compare(1250, 1200, { higherIsBetter: false, tolerance: 100 })).toEqual({
      direction: 'flat',
      amount: 0,
      tone: 'neutral',
    });
  });

  it('has nothing to say when either period is empty', () => {
    expect(compare(80, null, { higherIsBetter: true })).toBeNull();
    expect(compare(null, 80, { higherIsBetter: true })).toBeNull();
  });
});

describe('roundEstimate', () => {
  it('keeps small numbers exact and rounds larger ones to tens', () => {
    expect(roundEstimate(42.4)).toBe(42);
    expect(roundEstimate(99.6)).toBe(100);
    expect(roundEstimate(2337)).toBe(2340);
    expect(roundEstimate(2335)).toBe(2340);
  });
});

describe('projectUsage', () => {
  it('projects the month at the pace so far', () => {
    // September has 30 days; the 10th at noon is 9.5 days in.
    const projection = projectUsage({
      used: 741,
      limit: 3000,
      now: new Date('2026-09-10T12:00:00Z'),
    });

    expect(projection.perDay).toBeCloseTo(78, 0);
    expect(projection.projected).toBe(2340);
    expect(projection.exceedsLimit).toBe(false);
    expect(projection.limitReachedOn).toBeNull();
    expect(projection.resetsOn.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('says when the limit is reached at a pace that overshoots it', () => {
    const projection = projectUsage({
      used: 150,
      limit: 200,
      now: new Date('2026-09-11T00:00:00Z'),
    });

    // 15 a day: 450 by the end of September, 200 reached 13.3 days in.
    expect(projection.projected).toBe(450);
    expect(projection.exceedsLimit).toBe(true);
    expect(projection.limitReachedOn?.toISOString().slice(0, 10)).toBe('2026-09-14');
  });

  it('measures the pace over at least a day, so the first hour is not extrapolated', () => {
    const projection = projectUsage({
      used: 5,
      limit: 200,
      now: new Date('2026-09-01T00:30:00Z'),
    });

    expect(projection.perDay).toBe(5);
    expect(projection.projected).toBe(150);
    expect(projection.exceedsLimit).toBe(false);
  });

  it('never projects less than was already used, and dates a reached limit today', () => {
    const now = new Date('2026-09-20T08:00:00Z');
    const projection = projectUsage({ used: 3000, limit: 3000, now });

    expect(projection.projected).toBeGreaterThanOrEqual(3000);
    expect(projection.exceedsLimit).toBe(true);
    expect(projection.limitReachedOn?.toISOString()).toBe(now.toISOString());
  });

  it('projects nothing for an idle month', () => {
    const projection = projectUsage({ used: 0, limit: 200, now: new Date('2026-02-20T00:00:00Z') });

    expect(projection.projected).toBe(0);
    expect(projection.exceedsLimit).toBe(false);
    expect(projection.resetsOn.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});

describe('trigram similarity', () => {
  it('compares what a question is about, not the words every question has', () => {
    expect(contentWords('How do I install the widget?')).toEqual(['install', 'widget']);
    expect(contentWords('How do I?')).toEqual(['how', 'do', 'i']);

    expect(similarity('Is there a Slack integration?', 'Do you have a Slack integration')).toBe(1);
    expect(
      similarity('How do I install the widget?', 'how to install the widget on my site'),
    ).toBeGreaterThanOrEqual(0.5);
    expect(similarity('What is palette mode?', 'What is bubble mode?')).toBeLessThan(0.5);
    expect(similarity('Is there an API?', 'Is there a Slack integration?')).toBeLessThan(0.5);
    expect(similarity('How do I rotate an API key?', 'How do I delete my account?')).toBeLessThan(0.2);
  });

  it('pads words like pg_trgm does', () => {
    expect([...trigramsOf('key')].sort()).toEqual(['  k', ' ke', 'ey ', 'key'].sort());
  });
});

describe('groupGaps', () => {
  const row = (question: string, asks: number, lastAskedAt: string, conversationId: string) =>
    ({ question, asks, lastAskedAt, conversationId }) satisfies GapRow;

  it('merges wordings of one question and keeps different questions apart', () => {
    const groups = groupGaps([
      row('Is there a Slack integration?', 3, '2026-09-20T10:00:00Z', 'c-slack-1'),
      row('What is palette mode?', 1, '2026-09-21T10:00:00Z', 'c-palette'),
      row('Do you have a Slack integration', 2, '2026-09-22T10:00:00Z', 'c-slack-2'),
      row('slack integration??', 1, '2026-09-19T10:00:00Z', 'c-slack-3'),
      row('What is bubble mode?', 1, '2026-09-18T10:00:00Z', 'c-bubble'),
    ]);

    expect(groups).toEqual([
      {
        question: 'Is there a Slack integration?',
        asks: 6,
        // The latest ask across the wordings, and the conversation it happened in.
        lastAskedAt: '2026-09-22T10:00:00Z',
        conversationId: 'c-slack-2',
        variants: ['Do you have a Slack integration', 'slack integration??'],
      },
      {
        question: 'What is palette mode?',
        asks: 1,
        lastAskedAt: '2026-09-21T10:00:00Z',
        conversationId: 'c-palette',
        variants: [],
      },
      {
        question: 'What is bubble mode?',
        asks: 1,
        lastAskedAt: '2026-09-18T10:00:00Z',
        conversationId: 'c-bubble',
        variants: [],
      },
    ]);
  });

  it('lets the most asked wording lead, whatever order the rows arrive in', () => {
    const groups = groupGaps([
      row('install widget', 1, '2026-09-23T10:00:00Z', 'c-1'),
      row('How do I install the widget?', 4, '2026-09-20T10:00:00Z', 'c-2'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      question: 'How do I install the widget?',
      asks: 5,
      conversationId: 'c-1',
      variants: ['install widget'],
    });
  });

  it('compares with the leader only, so near misses do not chain', () => {
    // b is close to a and c is close to b, but c is not close to a.
    const groups = groupGaps(
      [
        row('alpha beta gamma', 3, '2026-09-20T10:00:00Z', 'a'),
        row('beta gamma delta', 2, '2026-09-20T10:00:00Z', 'b'),
        row('gamma delta epsilon', 1, '2026-09-20T10:00:00Z', 'c'),
      ],
      0.3,
    );

    expect(groups.map((group) => group.question)).toEqual([
      'alpha beta gamma',
      'gamma delta epsilon',
    ]);
    expect(groups[0]!.variants).toEqual(['beta gamma delta']);
  });

  it('returns nothing for nothing', () => {
    expect(groupGaps([])).toEqual([]);
  });
});

describe('firstLine', () => {
  it('skips code and markdown to the first line a reader would see', () => {
    expect(firstLine('Add one script tag to any page:\n\n```html\n<script src="x"></script>\n```')).toBe(
      'Add one script tag to any page:',
    );
    expect(firstLine('```bash\nnpm i\n```\n\n## Install\nRun it')).toBe('Install');
    expect(firstLine('1. **Create an assistant** in the dashboard [1].')).toBe(
      'Create an assistant in the dashboard.',
    );
    expect(firstLine('- See [the guide](https://docs.test/guide) and `api_key` [2][3]')).toBe(
      'See the guide and api_key',
    );
    expect(firstLine('Set my_api_key in *the* settings')).toBe('Set my_api_key in the settings');
    expect(firstLine('   \n\n')).toBe('');
  });

  it('cuts a long line at a word', () => {
    const line = firstLine(`${'word '.repeat(60)}end`, 40);

    expect(line.length).toBeLessThanOrEqual(41);
    expect(line.endsWith('word…')).toBe(true);
  });
});

describe('pageLabel', () => {
  it('shows the host with the path when there is one', () => {
    expect(pageLabel('docs.acme.test', '/pricing')).toBe('docs.acme.test/pricing');
    expect(pageLabel('', '/')).toBe('/');
  });
});
