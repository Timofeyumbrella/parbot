import type { SupabaseClient } from '@supabase/supabase-js';

import { usagePeriodStart } from '../../src/lib/plans';

/**
 * An account whose Overview has a known number in every section: answered, unanswered (three
 * wordings of one question among them), rated up and down, stopped, citing several pages (one
 * through an id that re-indexing replaced), asked from several widget pages, a lead, and a
 * previous week to compare with. `e2e/overview.spec.ts` checks the page against it.
 */

export const PASSWORD = 'overview-e2e-password';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const HOST = 'docs.acme.test';
export const USED_THIS_MONTH = 150;

export type Seeded = {
  userId: string;
  assistantId: string;
  dislikedConversationId: string;
  dislikedMessageId: string;
};

export const must = <T>({ data, error }: { data: T; error: { message: string } | null }) => {
  if (error || data === null || data === undefined) {
    throw new Error(error?.message ?? 'The seed query returned nothing.');
  }

  return data as NonNullable<T>;
};

type Exchange = {
  question: string;
  /** true answered, false unanswered, null stopped by the reader. */
  answered: boolean | null;
  answer?: string;
  /** Documents the answer cites, by key; `stale` is an id that re-indexing replaced. */
  cites?: ('auth' | 'webhooks' | 'faq' | 'legacy' | 'stale')[];
  feedback?: 1 | -1;
  latencyMs: number;
  minutesAgo: number;
  page?: string;
};

/** This week, oldest first. The minutes decide the order of every list below. */
const THIS_WEEK: Exchange[] = [
  {
    question: 'How do I rotate an API key?',
    answered: true,
    cites: ['auth', 'auth'],
    feedback: 1,
    latencyMs: 1000,
    minutesAgo: 170,
    page: `https://${HOST}/auth?ref=nav`,
  },
  {
    question: 'Where do I create API keys?',
    answered: true,
    cites: ['auth'],
    feedback: 1,
    latencyMs: 1200,
    minutesAgo: 160,
    page: `https://${HOST}/auth/`,
  },
  {
    question: 'How are webhooks signed?',
    answered: true,
    answer: 'Each webhook carries a **signature** header [1].\n\nVerify it with your secret.',
    cites: ['webhooks'],
    feedback: -1,
    latencyMs: 1400,
    minutesAgo: 150,
    page: `https://${HOST}/webhooks`,
  },
  {
    question: 'Do you have a Slack integration',
    answered: false,
    latencyMs: 900,
    minutesAgo: 140,
    page: `https://${HOST}/pricing`,
  },
  {
    question: 'Can I export conversations to CSV?',
    answered: false,
    latencyMs: 700,
    minutesAgo: 130,
    page: `https://${HOST}/pricing`,
  },
  { question: 'slack integration?', answered: false, latencyMs: 600, minutesAgo: 120 },
  {
    question: 'Is there a Slack integration?',
    answered: false,
    latencyMs: 800,
    minutesAgo: 110,
    page: `https://${HOST}/webhooks#retries`,
  },
  {
    question: 'How do I verify webhook signatures?',
    answered: true,
    answer: '1. Read the `X-Signature` header [1].\n2. Compare it with an HMAC of the body [2].',
    cites: ['webhooks', 'faq'],
    feedback: -1,
    latencyMs: 2000,
    minutesAgo: 100,
  },
  {
    question: 'Which keys can read webhooks?',
    answered: true,
    cites: ['stale'],
    latencyMs: 1600,
    minutesAgo: 90,
  },
  // Stopped by the reader: a question, but no finished answer, so no rate or time.
  { question: 'Tell me everything', answered: null, latencyMs: 50, minutesAgo: 80 },
];

/** The week before, for the changes. */
const WEEK_BEFORE: Exchange[] = [
  {
    question: 'How do I rotate an API key?',
    answered: true,
    cites: ['legacy'],
    feedback: 1,
    latencyMs: 3000,
    minutesAgo: 9 * 24 * 60,
  },
  {
    question: 'What is the rate limit?',
    answered: false,
    latencyMs: 2000,
    minutesAgo: 9 * 24 * 60 - 5,
  },
];

export const seedOverview = async (service: SupabaseClient, email: string): Promise<Seeded> => {
  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (error || !created.user) {
    throw new Error(error?.message ?? 'The throwaway account could not be created.');
  }

  const userId = created.user.id;
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();
  const at = (minutesAgo: number, plusSeconds = 0) =>
    new Date(now - minutesAgo * MINUTE + plusSeconds * 1000).toISOString();

  must(
    await service
      .from('subscriptions')
      .update({ plan_id: 'starter', status: 'active', billing_interval: 'monthly' })
      .eq('account_id', userId)
      .select('account_id'),
  );

  const assistant = must(
    await service
      .from('assistants')
      .insert({
        owner_id: userId,
        name: 'Acme Docs (overview e2e)',
        slug: `overview-e2e-${tag}`,
        lead_capture: true,
      })
      .select('id')
      .single(),
  );
  const assistantId = assistant.id as string;
  const owned = { assistant_id: assistantId, owner_id: userId };

  const site = must(
    await service
      .from('sources')
      .insert({ ...owned, kind: 'url', title: HOST, uri: `https://${HOST}`, status: 'ready' })
      .select('id')
      .single(),
  );
  const notes = must(
    await service
      .from('sources')
      .insert({
        ...owned,
        kind: 'text',
        title: 'FAQ',
        storage_path: `overview-${tag}`,
        status: 'ready',
      })
      .select('id')
      .single(),
  );

  const doc = (key: string, title: string, url: string | null, source: string, age: number) => ({
    ...owned,
    source_id: source,
    title,
    url,
    content: `${title} page.`,
    checksum: `${tag}-${key}`,
    created_at: new Date(now - age * DAY).toISOString(),
  });
  const documents = must(
    await service
      .from('documents')
      .insert([
        doc('auth', 'Authentication', `https://${HOST}/auth`, site.id, 20),
        doc('webhooks', 'Webhooks', `https://${HOST}/webhooks`, site.id, 20),
        doc('legacy', 'Legacy SDK', `https://${HOST}/legacy`, site.id, 20),
        doc('changelog', 'Changelog 2024', `https://${HOST}/changelog`, site.id, 19),
        doc('faq', 'FAQ', null, notes.id, 18),
      ])
      .select('id, title, url'),
  );
  const documentId = (title: string) => documents.find((row) => row.title === title)!.id as string;
  const citation = (key: NonNullable<Exchange['cites']>[number], index: number) => {
    if (key === 'stale') {
      // Re-indexing a changed page gives it a new id; the address still names it.
      return {
        index,
        documentId: crypto.randomUUID(),
        title: 'Authentication',
        url: `https://${HOST}/auth`,
        snippet: 'Keys…',
      };
    }

    const title = {
      auth: 'Authentication',
      webhooks: 'Webhooks',
      faq: 'FAQ',
      legacy: 'Legacy SDK',
    }[key];

    return {
      index,
      documentId: documentId(title),
      title,
      url: key === 'faq' ? null : `https://${HOST}/${key}`,
      snippet: `${title}…`,
    };
  };

  let disliked: { conversationId: string; messageId: string } | null = null;

  for (const exchange of [...THIS_WEEK, ...WEEK_BEFORE]) {
    const conversation = must(
      await service
        .from('conversations')
        .insert({
          ...owned,
          channel: exchange.page ? 'widget' : 'app',
          visitor_id: exchange.page ? `visitor-${tag}` : null,
          page_url: exchange.page ?? null,
          title: exchange.question,
          created_at: at(exchange.minutesAgo),
        })
        .select('id')
        .single(),
    );
    const cites = exchange.cites ?? [];
    const answer =
      exchange.answer ??
      (exchange.answered === false
        ? 'I could not find that in the documentation.'
        : `The answer to ${exchange.question} ${cites.map((_, index) => `[${index + 1}]`).join('')}`);

    must(
      await service
        .from('messages')
        .insert({
          ...owned,
          conversation_id: conversation.id,
          role: 'user',
          content: exchange.question,
          created_at: at(exchange.minutesAgo),
        })
        .select('id'),
    );

    const reply = must(
      await service
        .from('messages')
        .insert({
          ...owned,
          conversation_id: conversation.id,
          role: 'assistant',
          content: answer,
          citations: cites.map((key, index) => citation(key, index + 1)),
          answered: exchange.answered,
          feedback: exchange.feedback ?? null,
          latency_ms: exchange.latencyMs,
          created_at: at(exchange.minutesAgo, 2),
        })
        .select('id')
        .single(),
    );

    if (exchange.question === 'How do I verify webhook signatures?') {
      disliked = { conversationId: conversation.id as string, messageId: reply.id as string };
    }
  }

  must(
    await service
      .from('leads')
      .insert([
        { ...owned, email: `reader-${tag}@acme.test`, status: 'new', created_at: at(60) },
        {
          ...owned,
          email: `earlier-${tag}@acme.test`,
          status: 'contacted',
          created_at: at(9 * 24 * 60),
        },
      ])
      .select('id'),
  );

  must(
    await service
      .from('usage_counters')
      .upsert({
        owner_id: userId,
        metric: 'messages',
        period_start: usagePeriodStart(),
        value: USED_THIS_MONTH,
      })
      .select('value'),
  );

  return {
    userId,
    assistantId,
    dislikedConversationId: disliked!.conversationId,
    dislikedMessageId: disliked!.messageId,
  };
};
