/**
 * Pure helpers behind the Overview: comparing a period with the one before it, projecting the
 * month's usage, merging knowledge gaps that ask the same thing in different words, and turning an
 * answer into a one-line preview. Nothing here touches the database, so it is cheap to test.
 * Numbers and dates are formatted with `lib/format.ts`, never here.
 */

import { percentage } from '@/lib/analytics';

const DAY_MS = 86_400_000;

/** The start of the period of the same length just before the one that starts at `since`. */
export const previousPeriodStart = (since: Date, days: number) =>
  new Date(since.getTime() - days * DAY_MS);

// ---------------------------------------------------------------------------
// Answer quality
// ---------------------------------------------------------------------------

export type PeriodTotals = {
  questions: number;
  answered: number;
  unanswered: number;
  positive: number;
  negative: number;
  medianLatencyMs: number | null;
  leads: number;
  newLeads: number;
};

export const EMPTY_TOTALS: PeriodTotals = {
  questions: 0,
  answered: 0,
  unanswered: 0,
  positive: 0,
  negative: 0,
  medianLatencyMs: null,
  leads: 0,
  newLeads: 0,
};

/** Fewer ratings than this and helpfulness is shown as the small sample it is. */
export const SMALL_SAMPLE = 10;

export type Rate = {
  /** Whole-number percentage, or null when there is nothing to divide by. */
  percent: number | null;
  part: number;
  whole: number;
};

const rate = (part: number, whole: number): Rate => ({
  percent: whole > 0 ? percentage(part, whole) : null,
  part,
  whole,
});

/** Answered out of every answer the assistant finished (stopped ones say nothing about the docs). */
export const answerRate = (totals: PeriodTotals) =>
  rate(totals.answered, totals.answered + totals.unanswered);

/** Thumbs up out of every rated answer. */
export const helpfulness = (totals: PeriodTotals) =>
  rate(totals.positive, totals.positive + totals.negative);

export type Tone = 'good' | 'bad' | 'neutral';

export type Change = {
  direction: 'up' | 'down' | 'flat';
  /** The size of the change, always positive: percentage points or milliseconds. */
  amount: number;
  tone: Tone;
};

const toneOf = (direction: Change['direction'], higherIsBetter: boolean): Tone =>
  direction === 'flat' ? 'neutral' : (direction === 'up') === higherIsBetter ? 'good' : 'bad';

/**
 * How a value moved against the previous period, or null when either side has nothing to compare.
 * `tolerance` is the smallest move that counts, so a 30 ms wobble in answer time reads as flat.
 */
export const compare = (
  current: number | null,
  previous: number | null,
  { higherIsBetter, tolerance = 0 }: { higherIsBetter: boolean; tolerance?: number },
): Change | null => {
  if (current === null || previous === null) {
    return null;
  }

  const difference = current - previous;
  const direction =
    Math.abs(difference) <= tolerance ? 'flat' : difference > 0 ? 'up' : ('down' as const);

  return {
    direction,
    amount: direction === 'flat' ? 0 : Math.abs(difference),
    tone: toneOf(direction, higherIsBetter),
  };
};

/** Answer time changes smaller than this are noise from one slow reply, not a trend. */
export const LATENCY_TOLERANCE_MS = 100;

// ---------------------------------------------------------------------------
// Usage against the plan
// ---------------------------------------------------------------------------

export type UsageProjection = {
  used: number;
  limit: number;
  /** Where the month ends at the pace so far, rounded the way it is read out: "about 2,340". */
  projected: number;
  perDay: number;
  exceedsLimit: boolean;
  /** The day the limit is reached at this pace, when that falls inside the month. */
  limitReachedOn: Date | null;
  /** The first day of next month, when the counter resets. */
  resetsOn: Date;
};

/** A projection is an estimate; "about 2,340" reads as one where "2,337" pretends to precision. */
export const roundEstimate = (value: number) =>
  value < 100 ? Math.round(value) : Math.round(value / 10) * 10;

/**
 * Where the month's answers end up at the pace so far. Usage counters reset on the first of the
 * month in UTC. The pace is measured over at least one day, so a handful of answers in the first
 * hour of the month is not read as thousands by its end.
 */
export const projectUsage = ({
  used,
  limit,
  now,
}: {
  used: number;
  limit: number;
  now: Date;
}): UsageProjection => {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const monthDays = (nextMonth - monthStart) / DAY_MS;
  const elapsedDays = Math.min(Math.max((now.getTime() - monthStart) / DAY_MS, 1), monthDays);
  const perDay = used / elapsedDays;
  const projected = Math.max(roundEstimate(perDay * monthDays), used);
  // At the limit already counts: late in the month the pace may project no further than it.
  const exceedsLimit = used >= limit || projected > limit;
  let limitReachedOn: Date | null = null;

  if (exceedsLimit && perDay > 0) {
    const reachedAt = used >= limit ? now.getTime() : monthStart + (limit / perDay) * DAY_MS;

    limitReachedOn = reachedAt < nextMonth ? new Date(reachedAt) : null;
  }

  return {
    used,
    limit,
    projected,
    perDay,
    exceedsLimit,
    limitReachedOn,
    resetsOn: new Date(nextMonth),
  };
};

// ---------------------------------------------------------------------------
// Knowledge gaps
// ---------------------------------------------------------------------------

/**
 * Words that carry the shape of a question, not its topic. Left in, they made "What is palette
 * mode?" and "What is bubble mode?" look like the same question.
 */
const STOP_WORDS = new Set(
  (
    'a an the is are was were be been being am do does did doing done have has had having ' +
    'i me my mine we us our you your yours it its this that these those there here ' +
    'what which who whom whose when where why how can could should would will shall may might must ' +
    'to of in on at by for with from into onto about as than then so if or and but not no nor ' +
    'any some all get got please hi hello hey thanks thank just also yes'
  ).split(' '),
);

const WORD = /[\p{L}\p{N}]+/gu;

/** The words of a question that say what it is about, lower case, stop words removed. */
export const contentWords = (text: string) => {
  const words = text.toLowerCase().match(WORD) ?? [];
  const content = words.filter((word) => !STOP_WORDS.has(word));

  // A question made only of stop words ("how do I?") is still compared by what it says.
  return content.length > 0 ? content : words;
};

/** Trigrams the way pg_trgm makes them: each word padded with two spaces before and one after. */
export const trigramsOf = (text: string) => {
  const grams = new Set<string>();

  for (const word of contentWords(text)) {
    const padded = `  ${word} `;

    for (let index = 0; index + 3 <= padded.length; index += 1) {
      grams.add(padded.slice(index, index + 3));
    }
  }

  return grams;
};

/** Shared trigrams over all trigrams, from 0 (nothing in common) to 1 (the same words). */
export const trigramSimilarity = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }

  let shared = 0;

  for (const gram of a) {
    if (b.has(gram)) {
      shared += 1;
    }
  }

  return shared / (a.size + b.size - shared);
};

/** Two wordings at least this similar are one gap. */
export const GAP_SIMILARITY = 0.5;

export type GapRow = {
  question: string;
  asks: number;
  lastAskedAt: string;
  conversationId: string;
};

export type GapGroup = GapRow & {
  /** The other wordings merged into this gap, most asked first. */
  variants: string[];
};

const newer = (a: string, b: string) => Date.parse(a) > Date.parse(b);

/**
 * Merges unanswered questions that ask the same thing in different words. The most asked wording
 * leads its group; each other wording joins the first leader it is similar enough to. Comparing
 * with the leader only, never with a member, keeps a chain of near-misses from gluing unrelated
 * questions together. The group links to the conversation it was most recently asked in.
 */
export const groupGaps = (rows: GapRow[], threshold = GAP_SIMILARITY): GapGroup[] => {
  const ordered = [...rows].sort(
    (a, b) => b.asks - a.asks || Date.parse(b.lastAskedAt) - Date.parse(a.lastAskedAt),
  );
  const groups: GapGroup[] = [];
  const leaders = new Map<GapGroup, Set<string>>();

  for (const row of ordered) {
    const grams = trigramsOf(row.question);
    const group = groups.find(
      (candidate) => trigramSimilarity(leaders.get(candidate)!, grams) >= threshold,
    );

    if (!group) {
      const created: GapGroup = { ...row, variants: [] };

      groups.push(created);
      leaders.set(created, grams);
      continue;
    }

    group.asks += row.asks;
    group.variants.push(row.question);

    if (newer(row.lastAskedAt, group.lastAskedAt)) {
      group.lastAskedAt = row.lastAskedAt;
      group.conversationId = row.conversationId;
    }
  }

  return groups.sort(
    (a, b) => b.asks - a.asks || Date.parse(b.lastAskedAt) - Date.parse(a.lastAskedAt),
  );
};

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

const truncate = (text: string, max: number) => {
  if (text.length <= max) {
    return text;
  }

  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');

  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`;
};

/**
 * The first line of an answer as plain text: code blocks, list and heading markers, emphasis,
 * links and citation markers removed, cut at a word near `max` characters.
 */
export const firstLine = (content: string, max = 140) => {
  const withoutCode = content.replace(/```[\s\S]*?(?:```|$)/g, '\n');

  for (const raw of withoutCode.split('\n')) {
    const line = raw
      .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/, '')
      .replace(/\s*\[\d+\]/g, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/`([^`]*)`/g, '$1')
      // A single star or underscore only when it wraps words: snake_case names keep theirs.
      .replace(/(?<![\w*])([*_])(?!\s)(.+?)(?<!\s)\1(?![\w*])/g, '$2')
      .replace(/\s+/g, ' ')
      .trim();

    if (line) {
      return truncate(line, max);
    }
  }

  return '';
};

/** "docs.acme.com/pricing" for display; the path alone when the host is unknown. */
export const pageLabel = (host: string, path: string) => (host ? `${host}${path}` : path);
