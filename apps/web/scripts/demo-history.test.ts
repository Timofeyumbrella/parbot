// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { periodStart } from '../src/lib/analytics';
import { citationSnippet } from '../src/lib/citations';
import { DEPLOYED_APP_URL } from '../src/lib/env';
import { groupGaps, LATENCY_TOLERANCE_MS } from '../src/lib/overview';
import {
  answersThisMonth,
  citationFor,
  demoAppUrl,
  demoExchanges,
  HISTORY_DAYS,
  type LiveDocument,
  type LivePassage,
  pickPassage,
  repointCitations,
  scheduleHistory,
} from './demo-history';

const DOCS_DIR = fileURLToPath(new URL('../content/docs', import.meta.url));
/** No parbot.dev host resolves; only the mailboxes on that domain are meant to stay. */
const DEAD_HOST = /https?:\/\/(?:[a-z0-9-]+\.)*parbot\.dev\b/;
const DAY_MS = 86_400_000;

const docs = readdirSync(DOCS_DIR)
  .filter((name) => name.endsWith('.md'))
  .map((name) => ({ name, text: readFileSync(path.join(DOCS_DIR, name), 'utf8') }));

/** Every heading of a doc, the title (#) included, the way passages name their section. */
const headingsOf = (text: string) =>
  [...text.matchAll(/^#{1,4}\s+(.+?)\s*$/gm)].map((match) => match[1]!);

const titled = new Map(docs.map(({ text }) => [headingsOf(text)[0]!, headingsOf(text)]));

const EXCHANGES = demoExchanges(DEPLOYED_APP_URL);

const installAnswer = (appUrl: string) =>
  demoExchanges(appUrl).find((exchange) => exchange.answer?.includes('widget.js'))?.answer;

describe('the demo docs', () => {
  it('load the widget from the deployed host', () => {
    const widgetDoc = docs.find(({ name }) => name.endsWith('-widget.md'));

    expect(widgetDoc?.text).toContain(`<script src="${DEPLOYED_APP_URL}/widget.js"`);
  });

  it.each(docs)('$name links to no parbot.dev host', ({ text }) => {
    expect(text).not.toMatch(DEAD_HOST);
  });
});

describe('the seeded demo history', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('quotes widget.js on the app url it is seeded for', () => {
    expect(installAnswer('https://docs-bot.example.com/')).toContain(
      '<script src="https://docs-bot.example.com/widget.js" data-parbot="pb_your_public_key" async></script>',
    );
  });

  it('reads the app url from NEXT_PUBLIC_APP_URL and falls back to the deployed host', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', ' https://docs-bot.example.com ');
    expect(demoAppUrl()).toBe('https://docs-bot.example.com');

    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(demoAppUrl()).toBe(DEPLOYED_APP_URL);
  });

  it('links to no parbot.dev host', () => {
    for (const exchange of EXCHANGES) {
      expect(exchange.answer ?? '').not.toMatch(DEAD_HOST);
    }
  });

  it('cites pages and sections that the docs have, and only from answers', () => {
    for (const exchange of EXCHANGES) {
      if (exchange.answer === null) {
        expect(exchange.doc).toBeUndefined();
        continue;
      }

      expect(exchange.answer).toMatch(/\[1\]/);
      expect(titled.get(exchange.doc!), exchange.question).toBeDefined();
      expect(titled.get(exchange.doc!), exchange.question).toContain(exchange.section);
    }
  });
});

describe('scheduleHistory', () => {
  // Late and early in a UTC day: the week a question lands in must not depend on the hour.
  const moments = [new Date('2026-09-28T23:55:00Z'), new Date('2026-10-02T00:05:00Z')];

  it.each(moments)('dates every exchange in the two weeks before %s, never later', (now) => {
    const scheduled = scheduleHistory(EXCHANGES, now);
    const today = periodStart(1, now).getTime();

    expect(scheduled).toHaveLength(EXCHANGES.length);

    for (const { askedAt, answeredAt, latencyMs } of scheduled) {
      expect(askedAt.getTime()).toBeGreaterThanOrEqual(today - (HISTORY_DAYS - 1) * DAY_MS);
      expect(answeredAt.getTime()).toBeLessThan(today);
      expect(answeredAt.getTime() - askedAt.getTime()).toBe(latencyMs);
    }

    // Oldest first, so conversations and messages are written in the order they happened.
    const times = scheduled.map(({ askedAt }) => askedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it.each(moments)(
    'gives the default week and the week before it answers, gaps and both ratings (%s)',
    (now) => {
      const scheduled = scheduleHistory(EXCHANGES, now);
      const weekStart = periodStart(7, now).getTime();
      const weeks = [
        scheduled.filter(({ askedAt }) => askedAt.getTime() >= weekStart),
        scheduled.filter(
          ({ askedAt }) =>
            askedAt.getTime() < weekStart && askedAt.getTime() >= weekStart - 7 * DAY_MS,
        ),
      ];

      expect(weeks[0]!.length + weeks[1]!.length).toBe(EXCHANGES.length);

      for (const week of weeks) {
        const exchanges = week.map(({ exchange }) => exchange);

        expect(exchanges.some(({ answer }) => answer !== null)).toBe(true);
        expect(exchanges.some(({ answer }) => answer === null)).toBe(true);
        expect(exchanges.some(({ feedback }) => feedback === 1)).toBe(true);
        expect(exchanges.some(({ feedback }) => feedback === -1)).toBe(true);
      }

      // This week's gaps include one question in two wordings, which the Overview groups.
      const gaps = groupGaps(
        weeks[0]!
          .filter(({ exchange }) => exchange.answer === null)
          .map(({ exchange, askedAt }, index) => ({
            question: exchange.question,
            asks: 1,
            lastAskedAt: askedAt.toISOString(),
            conversationId: `c${index}`,
          })),
      );

      expect(gaps.some((gap) => gap.asks === 2 && gap.variants.length === 1)).toBe(true);

      // Answers got quicker, by more than the Overview's tolerance, so the change reads as one.
      const median = (week: typeof scheduled) => {
        const sorted = week.map(({ latencyMs }) => latencyMs).sort((a, b) => a - b);
        const middle = sorted.length / 2;

        return sorted.length % 2 === 0
          ? (sorted[middle - 1]! + sorted[middle]!) / 2
          : sorted[Math.floor(middle)]!;
      };

      expect(median(weeks[1]!) - median(weeks[0]!)).toBeGreaterThan(LATENCY_TOLERANCE_MS);
    },
  );
});

describe('answersThisMonth', () => {
  it('counts the answers since the first of the month, in UTC', () => {
    const lateSeptember = new Date('2026-09-28T12:00:00Z');

    expect(answersThisMonth(scheduleHistory(EXCHANGES, lateSeptember), lateSeptember)).toBe(
      EXCHANGES.length,
    );

    // Three days into October only the answers from October 1 and 2 count.
    const october = new Date('2026-10-03T08:00:00Z');
    const scheduled = scheduleHistory(EXCHANGES, october);
    const expected = scheduled.filter(
      ({ answeredAt }) => answeredAt >= new Date('2026-10-01T00:00:00Z'),
    ).length;

    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(EXCHANGES.length);
    expect(answersThisMonth(scheduled, october)).toBe(expected);
  });
});

const PRIVACY: LiveDocument = { id: 'doc-privacy', title: 'Privacy and security', url: null };
const FAQ: LiveDocument = { id: 'doc-faq', title: 'Frequently asked questions', url: null };

const passage = (
  id: string,
  documentId: string,
  position: number,
  heading: string,
  content: string,
): LivePassage => ({ id, documentId, position, heading, content });

const PASSAGES: LivePassage[] = [
  passage(
    'p-content',
    PRIVACY.id,
    0,
    'Privacy and security › Where your content goes',
    'Only the handful of passages closest to a question are sent to the language model. Parbot does not train models on your content.',
  ),
  passage(
    'p-delete',
    PRIVACY.id,
    1,
    'Privacy and security › Deleting data',
    'Deleting your account on the Account page removes the account and everything in it.',
  ),
  passage(
    'p-api',
    FAQ.id,
    0,
    'Frequently asked questions › Is there an API?',
    'Not yet. The endpoints the widget talks to are not documented for direct use.',
  ),
];

describe('pickPassage', () => {
  const privacy = PASSAGES.filter(({ documentId }) => documentId === PRIVACY.id);

  it('takes the passage under the named section', () => {
    expect(pickPassage(privacy, 'anything at all', 'Deleting data')?.id).toBe('p-delete');
  });

  it('falls back to the passage sharing the most words, then to the first', () => {
    expect(pickPassage(privacy, 'Do you train models on my content?')?.id).toBe('p-content');
    expect(pickPassage(privacy, 'Delete the account', 'No such section')?.id).toBe('p-delete');
    expect(pickPassage(privacy, 'zzz')?.id).toBe('p-content');
    expect(pickPassage([], 'anything')).toBeNull();
  });
});

describe('citationFor', () => {
  const deleteAccount = EXCHANGES.find(
    ({ question }) => question === 'How do I delete my account?',
  )!;

  it('cites the page indexed now at the passage the answer comes from', () => {
    expect(citationFor(deleteAccount, [PRIVACY, FAQ], PASSAGES)).toEqual({
      index: 1,
      documentId: PRIVACY.id,
      title: PRIVACY.title,
      url: null,
      snippet: citationSnippet(PASSAGES[1]!.content),
      chunkId: 'p-delete',
    });
  });

  it('cites nothing for an unanswered question or a page that is not indexed', () => {
    const gap = EXCHANGES.find(({ answer }) => answer === null)!;

    expect(citationFor(gap, [PRIVACY, FAQ], PASSAGES)).toBeNull();
    expect(citationFor(deleteAccount, [FAQ], PASSAGES)).toBeNull();
  });
});

describe('repointCitations', () => {
  const stale = {
    index: 1,
    documentId: 'doc-privacy-before-reindex',
    title: 'Privacy and security',
    url: null,
    snippet: 'Deleting your account on the Account page removes the account and everything in it.',
    chunkId: 'p-gone',
  };

  it('moves a citation of a replaced page to the page of the same title, at the nearest passage', () => {
    const result = repointCitations([stale], [PRIVACY, FAQ], PASSAGES);

    expect(result).toEqual({
      citations: [
        {
          ...stale,
          documentId: PRIVACY.id,
          chunkId: 'p-delete',
          snippet: citationSnippet(PASSAGES[1]!.content),
        },
      ],
      changed: 1,
      unresolved: 0,
    });
  });

  it('keeps the page but finds a new passage when only the passage is gone', () => {
    const lost = { ...stale, documentId: PRIVACY.id };
    const result = repointCitations([lost], [PRIVACY], PASSAGES);

    expect(result.changed).toBe(1);
    expect(result.citations[0]).toMatchObject({ documentId: PRIVACY.id, chunkId: 'p-delete' });
  });

  it('leaves a working citation, an unknown page and anything unrecognisable alone', () => {
    const fine = { ...stale, documentId: FAQ.id, title: FAQ.title, chunkId: 'p-api' };
    const legacy = { index: 2, documentId: FAQ.id, title: FAQ.title, url: null, snippet: 'x' };
    const gone = { ...stale, documentId: 'doc-removed', title: 'Removed page' };
    const junk = { note: 'not a citation' };
    const result = repointCitations([fine, legacy, gone, junk], [PRIVACY, FAQ], PASSAGES);

    expect(result.citations[0]).toBe(fine);
    // Saved before passages had ids: still a working link to the page.
    expect(result.citations[1]).toBe(legacy);
    expect(result.citations[2]).toBe(gone);
    expect(result.citations[3]).toBe(junk);
    expect(result).toMatchObject({ changed: 0, unresolved: 1 });
  });

  it('drops a stale passage id when the new page has no passages to point at', () => {
    const result = repointCitations([stale], [PRIVACY], []);

    expect(result.citations[0]).toEqual({
      index: 1,
      documentId: PRIVACY.id,
      title: PRIVACY.title,
      url: null,
      snippet: stale.snippet,
    });
  });
});
