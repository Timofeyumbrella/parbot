import type { Citation } from '@parbot/shared';

import { citationSnippet } from '../src/lib/citations';
import { DEPLOYED_APP_URL } from '../src/lib/env';
import { HEADING_SEPARATOR } from '../src/lib/ingest/chunk';

/**
 * The demo's seeded history, and the pure parts of seeding it: when each exchange happened, which
 * indexed passage each answer cites, how many answers it adds to this month's usage, and how to
 * re-point a citation whose page was re-indexed under a new id. Nothing here touches the database.
 */

/**
 * The app's own host for the seeded answers. Seeding the hosted demo from a laptop needs
 * NEXT_PUBLIC_APP_URL set to the deployment; without one the answers name the deployed host.
 */
export const demoAppUrl = (value = process.env.NEXT_PUBLIC_APP_URL) =>
  value?.trim() || DEPLOYED_APP_URL;

const widgetScriptUrl = (appUrl: string) => `${appUrl.replace(/\/+$/, '')}/widget.js`;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** The history covers the two weeks before the seed runs: this week and the week before it. */
export const HISTORY_DAYS = 14;

export type Exchange = {
  question: string;
  answer: string | null;
  /** The title of the cited page, as indexed from apps/web/content/docs. */
  doc?: string;
  /** The heading of the section the answer comes from, which picks the cited passage. */
  section?: string;
  feedback?: 1 | -1;
  channel?: 'app' | 'widget';
  page?: string;
  /**
   * Whole UTC days before the day the seed runs: 1 is yesterday. The Overview's default week is
   * days 1 to 6 (and today), the week it is compared with days 7 to 13. Never 0, so every
   * exchange is in the past whatever the time of day.
   */
  daysAgo: number;
  /** The UTC hour it was asked at. */
  hour: number;
};

/**
 * Questions a reader of Parbot's docs would ask, answered or not, oldest first, for the Inbox and
 * the Overview. Each week has answers, gaps and ratings, so the default week reads against the one
 * before; the two Slack wordings show gaps grouped. `appUrl` is the host that serves widget.js, so
 * a quoted install snippet loads when copied.
 */
export const demoExchanges = (appUrl: string): Exchange[] => [
  // The week before.
  {
    question: 'What is palette mode?',
    answer:
      'Palette mode has no launcher in the way. Readers press ⌘K, or Ctrl+K on Windows and Linux, and a command-palette style dialog opens with the question box on top. It is available on Starter and Growth [1].',
    doc: 'Installing the widget',
    section: 'Two modes',
    page: 'https://docs.example.com/widget',
    daysAgo: 13,
    hour: 9,
  },
  {
    question: 'How many pages can I index on the Starter plan?',
    answer: 'Starter includes 2,000 indexed pages and 3,000 answers a month [1].',
    doc: 'Plans and billing',
    section: 'Plans and billing',
    feedback: 1,
    page: 'https://docs.example.com/pricing',
    daysAgo: 12,
    hour: 14,
  },
  {
    question: 'Do you support JavaScript-rendered docs sites?',
    answer:
      'Not for crawling: pages that render everything with JavaScript after load are not rendered. Give Parbot a sitemap or export the pages instead [1].',
    doc: 'Frequently asked questions',
    section: 'Which documentation works best?',
    feedback: -1,
    page: 'https://docs.example.com/sources',
    daysAgo: 11,
    hour: 10,
  },
  {
    question: 'Can I connect a private Notion workspace?',
    answer: null,
    page: 'https://docs.example.com/sources',
    daysAgo: 10,
    hour: 16,
  },
  {
    question: 'How do I delete my account?',
    answer:
      'Delete it on the Account page. That removes the account and everything in it. To start over with a new assistant instead, delete the assistant in Settings; that removes everything it owns, uploaded files included [1].',
    doc: 'Privacy and security',
    section: 'Deleting data',
    channel: 'app',
    daysAgo: 9,
    hour: 11,
  },
  {
    question: 'Does it work with Docusaurus?',
    answer:
      'Yes. For Docusaurus, Mintlify, Astro, Hugo and plain HTML, paste the script tag into the site head or footer template [1].',
    doc: 'Installing the widget',
    section: 'Frameworks',
    feedback: 1,
    page: 'https://docs.example.com/widget',
    daysAgo: 8,
    hour: 15,
  },
  // This week.
  {
    question: 'What happens when the docs do not cover a question?',
    answer:
      'The assistant says so instead of guessing. With lead capture on, the widget then offers a small form for an email and a note, and the lead appears in your Inbox. The question is also recorded as unanswered [1].',
    doc: 'Theming and behaviour',
    section: 'When the docs fall short',
    feedback: 1,
    channel: 'app',
    daysAgo: 6,
    hour: 9,
  },
  {
    question: 'Is there a Slack integration?',
    answer: null,
    page: 'https://docs.example.com/integrations',
    daysAgo: 6,
    hour: 13,
  },
  {
    question: 'Can I restrict which sites can load my widget?',
    answer:
      'Yes. Add the origins on the Widget page, one per line. Bare hostnames and wildcards like *.example.com are accepted, and requests from anywhere else are refused [1].',
    doc: 'Installing the widget',
    section: 'Allowed origins',
    feedback: 1,
    page: 'https://docs.example.com/widget',
    daysAgo: 5,
    hour: 10,
  },
  {
    question: 'Do you have a Slack integration?',
    answer: null,
    page: 'https://docs.example.com/integrations',
    daysAgo: 4,
    hour: 15,
  },
  {
    question: 'Can I export conversations to CSV automatically every week?',
    answer: null,
    page: 'https://docs.example.com/inbox',
    daysAgo: 3,
    hour: 9,
  },
  {
    question: 'Does Parbot train models on my documentation?',
    answer:
      'No. Only the handful of passages closest to a question are sent to the model, together with the question and the recent turns of that conversation. Parbot does not train models on your content [1].',
    doc: 'Privacy and security',
    section: 'Where your content goes',
    feedback: 1,
    page: 'https://docs.example.com/privacy',
    daysAgo: 3,
    hour: 17,
  },
  {
    question: 'Is there an API?',
    answer:
      'Not yet. The endpoints the widget talks to are not documented for direct use and may change. To build your own interface, write to support@parbot.dev [1].',
    doc: 'Frequently asked questions',
    section: 'Is there an API?',
    feedback: -1,
    page: 'https://docs.example.com/api',
    daysAgo: 2,
    hour: 12,
  },
  {
    question: 'How do I install the widget on my docs site?',
    answer: `Add one script tag to any page:\n\n\`\`\`html\n<script src="${widgetScriptUrl(appUrl)}" data-parbot="pb_your_public_key" async></script>\n\`\`\`\n\nThe exact snippet with your key is on the Widget page of your assistant [1].`,
    doc: 'Installing the widget',
    section: 'Installing the widget',
    feedback: 1,
    page: 'https://docs.example.com/getting-started',
    daysAgo: 1,
    hour: 10,
  },
];

export type ScheduledExchange = {
  exchange: Exchange;
  askedAt: Date;
  answeredAt: Date;
  latencyMs: number;
};

/**
 * When each exchange happened, on the UTC day grid the Overview counts in: `daysAgo` whole days
 * before today, at its hour. Dated from `now`, so a refresh always ends yesterday.
 */
export const scheduleHistory = (exchanges: Exchange[], now: Date): ScheduledExchange[] => {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return exchanges.map((exchange, index) => {
    const askedAt = new Date(
      today - exchange.daysAgo * DAY_MS + exchange.hour * HOUR_MS + ((index * 17) % 50) * MINUTE_MS,
    );
    // From the question to the finished answer: spread like a fast model's, and a little quicker
    // each day, so this week's time to answer reads as an improvement on the week before.
    const latencyMs = 1300 + ((index * 389) % 700) + (exchange.daysAgo - 1) * 65;

    return { exchange, askedAt, answeredAt: new Date(askedAt.getTime() + latencyMs), latencyMs };
  });
};

/** Answers the seeded history adds to the current month's usage (the counter resets on the 1st, UTC). */
export const answersThisMonth = (scheduled: ScheduledExchange[], now: Date) => {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);

  return scheduled.filter(({ answeredAt }) => answeredAt.getTime() >= monthStart).length;
};

export type LiveDocument = { id: string; title: string; url: string | null };

export type LivePassage = {
  id: string;
  documentId: string;
  heading: string | null;
  content: string;
  position: number;
};

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .replace(/\[\d+\]/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2),
  );

const overlap = (a: Set<string>, b: Set<string>) => {
  let shared = 0;

  for (const word of a) {
    if (b.has(word)) {
      shared += 1;
    }
  }

  return shared;
};

const byPosition = (a: LivePassage, b: LivePassage) => a.position - b.position;

/** A passage's own section: the last step of its heading path. */
const sectionOf = (passage: LivePassage) =>
  passage.heading?.split(HEADING_SEPARATOR).at(-1)?.trim() ?? null;

/**
 * The passage of a page that best stands behind `text`: the one under `section` when there is
 * one, else the one sharing the most words with it, the earliest on a tie.
 */
export const pickPassage = (
  passages: LivePassage[],
  text: string,
  section?: string | null,
): LivePassage | null => {
  const ordered = [...passages].sort(byPosition);
  const inSection = section ? ordered.filter((passage) => sectionOf(passage) === section) : [];
  const candidates = inSection.length > 0 ? inSection : ordered;
  const wanted = words(text);
  let best: LivePassage | null = null;
  let bestScore = -1;

  for (const passage of candidates) {
    const score = overlap(wanted, words(`${passage.heading ?? ''} ${passage.content}`));

    if (score > bestScore) {
      best = passage;
      bestScore = score;
    }
  }

  return best;
};

const citationOf = (
  index: number,
  document: LiveDocument,
  passage: LivePassage | null,
): Citation => ({
  index,
  documentId: document.id,
  title: document.title,
  url: document.url,
  snippet: passage ? citationSnippet(passage.content) : '',
  ...(passage ? { chunkId: passage.id } : {}),
});

/**
 * The citation an exchange's answer carries, against the pages and passages indexed now, or null
 * when it cites nothing or its page is not indexed.
 */
export const citationFor = (
  exchange: Exchange,
  documents: LiveDocument[],
  passages: LivePassage[],
): Citation | null => {
  if (!exchange.answer || !exchange.doc) {
    return null;
  }

  const document = documents.find(({ title }) => title === exchange.doc);

  if (!document) {
    return null;
  }

  const own = passages.filter((passage) => passage.documentId === document.id);

  return citationOf(1, document, pickPassage(own, exchange.answer, exchange.section));
};

/** Only what re-pointing reads from a stored citation; anything else on it is kept as it is. */
export type StoredCitation = Record<string, unknown> & {
  index: number;
  documentId: string;
  title: string;
  snippet?: string;
  chunkId?: string;
};

export const isStoredCitation = (value: unknown): value is StoredCitation =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as StoredCitation).index === 'number' &&
  typeof (value as StoredCitation).documentId === 'string' &&
  typeof (value as StoredCitation).title === 'string';

/** The citation moved to `document`, at `passage` when there is one; its other fields stay. */
const moveCitation = (
  citation: StoredCitation,
  document: LiveDocument,
  passage: LivePassage | null,
): StoredCitation => {
  const moved: StoredCitation = {
    ...citation,
    documentId: document.id,
    title: document.title,
    url: document.url,
  };

  // A passage id from the old page would open nothing; without a new one the page opens at the top.
  delete moved.chunkId;

  return passage
    ? { ...moved, snippet: citationSnippet(passage.content), chunkId: passage.id }
    : moved;
};

export type Repointed = {
  citations: unknown[];
  /** Citations moved to another page id or another passage. */
  changed: number;
  /** Citations whose page is gone and has no page of the same title to move to. */
  unresolved: number;
};

/**
 * Re-indexing a changed page replaces it: the page and its passages get new ids, and a citation
 * saved earlier opens "This page is not in the knowledge anymore". This moves each such citation
 * to the page indexed now under the same title, at the passage closest to the one it quoted. A
 * citation whose page is still there but whose passage is not keeps the page and gets the nearest
 * passage. Citations that are fine, or not recognisable, come back unchanged.
 */
export const repointCitations = (
  citations: unknown[],
  documents: LiveDocument[],
  passages: LivePassage[],
): Repointed => {
  const byId = new Map(documents.map((document) => [document.id, document]));
  const passagesOf = (documentId: string) =>
    passages.filter((passage) => passage.documentId === documentId);
  let changed = 0;
  let unresolved = 0;

  const next = citations.map((citation) => {
    if (!isStoredCitation(citation)) {
      return citation;
    }

    const current = byId.get(citation.documentId);

    if (current) {
      const own = passagesOf(current.id);
      const passageIsThere =
        !citation.chunkId || own.some((passage) => passage.id === citation.chunkId);

      if (passageIsThere) {
        return citation;
      }

      changed += 1;

      return moveCitation(citation, current, pickPassage(own, citation.snippet ?? citation.title));
    }

    const replacement = documents.find(({ title }) => title === citation.title);

    if (!replacement) {
      unresolved += 1;

      return citation;
    }

    changed += 1;

    return moveCitation(
      citation,
      replacement,
      pickPassage(passagesOf(replacement.id), citation.snippet ?? citation.title),
    );
  });

  return { citations: next, changed, unresolved };
};
