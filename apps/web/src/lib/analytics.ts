/**
 * Pure helpers behind the Overview and the Inbox: period maths, percentages, bucketing a
 * daily series into a gap-free range, axis ticks and the search-param parsers. Nothing in
 * here touches the database, so it is cheap to test and safe to import from client code.
 * Dates and counts are formatted with `lib/format.ts`, never here.
 */

export const PERIODS = [7, 30] as const;

export type PeriodDays = (typeof PERIODS)[number];

export const DEFAULT_PERIOD: PeriodDays = 30;

const DAY_MS = 86_400_000;

/** Reads `?days=` into one of the supported periods. Anything else falls back to the default. */
export const parseDays = (value: string | string[] | undefined): PeriodDays => {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);

  return PERIODS.find((period) => period === parsed) ?? DEFAULT_PERIOD;
};

/** Midnight UTC of the day the period starts on, so that `days` buckets end with today. */
export const periodStart = (days: number, now = new Date()) => {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return new Date(today - (days - 1) * DAY_MS);
};

/** Whole-number percentage, 0 when there is nothing to divide by. */
export const percentage = (part: number, total: number) =>
  total > 0 ? Math.round((Math.max(part, 0) / total) * 100) : 0;

export type DailyRow = {
  day: string;
  questions: number;
  answered: number;
  unanswered: number;
};

export const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Spreads sparse daily rows over every day from `since` to `days` later, filling the gaps
 * with zeros so a chart has one bar per day whether or not anyone wrote that day.
 */
export const bucketDaily = (rows: DailyRow[], since: Date, days: number): DailyRow[] => {
  const byDay = new Map(rows.map((row) => [row.day.slice(0, 10), row]));
  const start = Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate());

  return Array.from({ length: Math.max(days, 0) }, (_, index) => {
    const day = dayKey(new Date(start + index * DAY_MS));
    const row = byDay.get(day);

    return {
      day,
      questions: Number(row?.questions ?? 0),
      answered: Number(row?.answered ?? 0),
      unanswered: Number(row?.unanswered ?? 0),
    };
  });
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 3" for a YYYY-MM-DD key or a date, in UTC to match the daily buckets. */
export const dayLabel = (value: string | Date) => {
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value;

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
};

/** Clean axis ticks for a bar chart: 0, a midpoint and a rounded ceiling at or above `max`. */
export const niceTicks = (max: number): number[] => {
  if (max <= 0) {
    return [0];
  }

  if (max <= 4) {
    return Array.from({ length: max + 1 }, (_, index) => index);
  }

  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const step = (normalized <= 2 ? 0.5 : normalized <= 5 ? 1 : 2) * magnitude;
  let ceiling = Math.ceil(max / step) * step;

  // A whole-number midpoint reads better than a shorter axis, so grow to the next step.
  while (!Number.isInteger(ceiling / 2)) {
    ceiling += step;
  }

  return [0, ceiling / 2, ceiling];
};

/**
 * Which day indexes get an axis label when `count` bars share `width` pixels: the first, the
 * last, and every n-th in between so that labels never sit closer than `minGap` pixels.
 */
export const labelIndexes = (count: number, width: number, minGap = 44): number[] => {
  if (count <= 0) {
    return [];
  }

  const slot = width / count;
  const every = Math.max(1, Math.ceil(minGap / Math.max(slot, 1)));
  const last = count - 1;
  const picked: number[] = [];

  for (let index = 0; index < count; index += every) {
    // Skip a label that would collide with the always-present last one.
    if (index !== last && (last - index) * slot < minGap) {
      continue;
    }

    picked.push(index);
  }

  if (picked[picked.length - 1] !== last) {
    picked.push(last);
  }

  return picked;
};

/** The host of a page URL for compact display, or null when it is not a URL. */
export const hostnameOf = (url: string | null | undefined) => {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
};

export const CONVERSATION_FILTERS = ['all', 'widget', 'app', 'unanswered'] as const;

export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number];

export const parseConversationFilter = (
  value: string | string[] | undefined,
): ConversationFilter => {
  const raw = Array.isArray(value) ? value[0] : value;

  return CONVERSATION_FILTERS.find((filter) => filter === raw) ?? 'all';
};

export const LEAD_STATUSES = ['new', 'contacted', 'closed'] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const INBOX_TABS = ['conversations', 'leads'] as const;

export type InboxTab = (typeof INBOX_TABS)[number];

export const parseInboxTab = (value: string | string[] | undefined): InboxTab => {
  const raw = Array.isArray(value) ? value[0] : value;

  return INBOX_TABS.find((tab) => tab === raw) ?? 'conversations';
};

/** The Inbox URL for a tab and, on the conversations tab, a filter. Defaults are left out. */
export const inboxHref = (
  assistantId: string,
  tab: InboxTab,
  filter: ConversationFilter = 'all',
) => {
  const params = new URLSearchParams();

  if (tab !== 'conversations') {
    params.set('tab', tab);
  }

  if (tab === 'conversations' && filter !== 'all') {
    params.set('filter', filter);
  }

  const query = params.toString();

  return `/a/${assistantId}/inbox${query ? `?${query}` : ''}`;
};

/** True for a conversation URL (/a/[assistantId]/inbox/[conversationId]), false for the list. */
export const isConversationPath = (pathname: string) => /\/inbox\/[^/?#]+\/?$/.test(pathname);
