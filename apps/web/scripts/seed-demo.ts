/**
 * Seeds the demo: the demo account on Starter, a "Parbot Docs" assistant trained on
 * apps/web/content/docs, and with --history two weeks of realistic conversations plus a lead.
 *
 *   pnpm --filter web seed:demo                    docs only; a doc whose text is unchanged is left alone
 *   pnpm --filter web seed:demo --history          docs plus the history (skipped if history exists)
 *   pnpm --filter web seed:demo --refresh-history  docs, then the history replaced, ending yesterday
 *   pnpm --filter web seed:demo --reset            delete the demo assistant first (a new public key)
 *   pnpm --filter web seed:demo --write-env        also write NEXT_PUBLIC_DEMO_ASSISTANT_KEY into .env
 *
 * The history is dated relative to the moment it is seeded, so it ages out of the Overview's week
 * after a few days. --refresh-history brings it back without touching the assistant, its settings
 * or its public key (the landing palette and the README link depend on the key): it deletes the
 * assistant's conversations (their messages, stops and references go with them), its leads and its
 * chat projects, seeds the history again with citations resolved against the pages and passages
 * indexed now, and sets this month's answer count to what that history accounts for. It cannot be
 * combined with --reset, which deletes the assistant.
 *
 * Every run keeps citations working: a doc whose stored text is unchanged is not re-indexed, so
 * its page keeps its id; a changed doc is re-indexed under a new id, and any saved citation of the
 * old one is moved to the new page with the same title. A summary of what was deleted, created and
 * moved is printed at the end.
 *
 * Runs outside Next, so it builds its own service client and never imports server-only modules.
 * With GEMINI_API_KEY unset it indexes on the stub provider, which is fine for local demos.
 * The seeded install answer quotes widget.js on NEXT_PUBLIC_APP_URL, so set it to the deployment
 * when seeding the hosted demo.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import { getAiProvider, hasLiveAiProvider } from '../src/lib/ai';
import type { Database, Json } from '../src/lib/db/types';
import { UNANSWERED_TEXT } from '../src/lib/engine/prompt';
import { formatCount, plural } from '../src/lib/format';
import { ingestSource } from '../src/lib/ingest';
import { usagePeriodStart } from '../src/lib/plans';
import {
  answersThisMonth,
  citationFor,
  demoAppUrl,
  demoExchanges,
  type LiveDocument,
  type LivePassage,
  repointCitations,
  scheduleHistory,
} from './demo-history';
import {
  countHistory,
  deleteOldHistory,
  type HistoryCounts,
  must,
  type Service,
} from './demo-store';
import { parseSeedFlags } from './seed-flags';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(here, '../content/docs');
const ENV_FILE = path.resolve(here, '../../../.env');

const DEMO_EMAIL = 'demo@parbot.dev';
const DEMO_PASSWORD = 'parbot-demo';
const DEMO_NAME = 'Demo Founder';
const SLUG = 'parbot-docs';
/** Rows per request when reading every saved answer; PostgREST caps a response at 1,000. */
const PAGE_SIZE = 500;

const required = (name: string) => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name}. Run this from apps/web with the root .env linked in.`);
  }

  return value;
};

const log = (message: string) => console.info(`  ${message}`);

const EXCHANGES = demoExchanges(demoAppUrl());

/** What the run did, printed at the end. */
const summary = {
  docs: { indexed: 0, unchanged: 0, failed: 0 },
  deleted: null as null | HistoryCounts,
  created: null as null | {
    conversations: number;
    messages: number;
    leads: number;
    uncited: number;
  },
  citations: { changed: 0, answers: 0, unresolved: 0 },
  usage: null as null | { before: number; after: number },
};

const ensureDemoUser = async (service: Service) => {
  const { data: profile } = await service
    .from('profiles')
    .select('id')
    .eq('email', DEMO_EMAIL)
    .maybeSingle();

  if (profile) {
    return profile.id;
  }

  const { data, error } = await service.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: DEMO_NAME },
  });

  if (error || !data.user) {
    throw new Error(`Could not create the demo user: ${error?.message ?? 'unknown error'}`);
  }

  log(`created ${DEMO_EMAIL}`);

  return data.user.id;
};

/** Starter unlocks the palette, theme, lead capture and branding switch the demo shows off. */
const putOnStarter = async (service: Service, ownerId: string) => {
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await service.from('subscriptions').upsert(
    {
      account_id: ownerId,
      plan_id: 'starter',
      status: 'active',
      billing_interval: 'monthly',
      current_period_end: periodEnd,
      cancel_at_period_end: false,
    },
    { onConflict: 'account_id' },
  );

  if (error) {
    throw new Error(`Could not set the plan: ${error.message}`);
  }
};

/** The demo account's one assistant: the one it has, or Parbot Docs created now. */
const ensureAssistant = async (service: Service, ownerId: string, reset: boolean) => {
  if (reset) {
    await service.from('assistants').delete().eq('owner_id', ownerId);
    log('deleted the previous demo assistant');
  }

  // Looked up by owner, not slug: an account owns one assistant, so a renamed slug is still it.
  const { data: existing } = await service
    .from('assistants')
    .select('id, public_key')
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  const { data, error } = await service
    .from('assistants')
    .insert({
      owner_id: ownerId,
      name: 'Parbot Docs',
      slug: SLUG,
      description: 'Answers questions about Parbot itself, from the product docs.',
      instructions:
        'The product is Parbot. When a reader asks how to do something, give the steps.',
      welcome_message: 'Ask me anything about Parbot: sources, the widget, plans or privacy.',
      suggested_questions: [
        'How do I install the widget?',
        'What happens when the docs do not cover a question?',
        'What is the difference between bubble and palette mode?',
        'How many pages can I index on Starter?',
      ],
      mode: 'palette',
      theme: { scheme: 'auto', accent: '#f59e0b', position: 'right', radius: 'md' },
      allowed_origins: [],
      hide_branding: true,
      lead_capture: true,
    })
    .select('id, public_key')
    .single();

  if (error || !data) {
    throw new Error(`Could not create the assistant: ${error?.message ?? 'unknown error'}`);
  }

  log('created the Parbot Docs assistant');

  return data;
};

const titleOf = (markdown: string, fallback: string) =>
  markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fallback;

/** The text stored for a source, or null when there is none to compare with. */
const storedText = async (service: Service, storagePath: string) => {
  const { data, error } = await service.storage.from('sources').download(storagePath);

  return error || !data ? null : data.text();
};

const indexDocs = async (service: Service, ownerId: string, assistantId: string) => {
  const provider = getAiProvider();
  const files = (await readdir(DOCS_DIR)).filter((name) => name.endsWith('.md')).sort();

  log(`indexing ${files.length} docs on the ${hasLiveAiProvider() ? 'Gemini' : 'stub'} provider`);

  for (const file of files) {
    const markdown = await readFile(path.join(DOCS_DIR, file), 'utf8');
    const title = titleOf(markdown, file.replace(/^\d+-/, '').replace(/\.md$/, ''));

    const { data: known } = await service
      .from('sources')
      .select('id, storage_path, status, document_count')
      .eq('assistant_id', assistantId)
      .eq('title', title)
      .maybeSingle();

    // Re-indexing a changed page gives it a new id; an unchanged one is left alone so every
    // citation of it keeps working and no embedding quota is spent.
    if (
      known?.storage_path &&
      known.status === 'ready' &&
      known.document_count > 0 &&
      (await storedText(service, known.storage_path)) === markdown
    ) {
      summary.docs.unchanged += 1;
      log(`${title}: unchanged, left as it is`);
      continue;
    }

    const storagePath =
      known?.storage_path ?? `${ownerId}/${assistantId}/${crypto.randomUUID()}.md`;
    const { error: uploadError } = await service.storage
      .from('sources')
      .upload(storagePath, Buffer.from(markdown, 'utf8'), {
        contentType: 'text/markdown',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Could not store ${file}: ${uploadError.message}`);
    }

    let sourceId = known?.id;

    if (!sourceId) {
      const { data, error } = await service
        .from('sources')
        .insert({
          assistant_id: assistantId,
          owner_id: ownerId,
          kind: 'text',
          title,
          storage_path: storagePath,
          mime_type: 'text/markdown',
          byte_size: Buffer.byteLength(markdown),
          status: 'queued',
        })
        .select('id')
        .single();

      if (error || !data) {
        throw new Error(
          `Could not create the source for ${file}: ${error?.message ?? 'unknown error'}`,
        );
      }

      sourceId = data.id;
    } else {
      await service
        .from('sources')
        .update({ byte_size: Buffer.byteLength(markdown) })
        .eq('id', sourceId);
    }

    const result = await ingestSource({ service, provider, sourceId });

    const { data: source } = await service
      .from('sources')
      .select('status, chunk_count, error')
      .eq('id', sourceId)
      .single();

    summary.docs[result.status === 'ready' ? 'indexed' : 'failed'] += 1;
    log(
      `${title}: ${source?.status ?? 'unknown'}${source?.chunk_count ? `, ${source.chunk_count} passages` : ''}${source?.error ? `, ${source.error}` : ''}`,
    );
  }
};

/** The assistant's pages and passages as they are indexed now. */
const loadKnowledge = async (service: Service, assistantId: string) => {
  const documents =
    must(
      await service.from('documents').select('id, title, url').eq('assistant_id', assistantId),
      'load the indexed pages',
    ) ?? [];
  const passages: LivePassage[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const rows =
      must(
        await service
          .from('chunks')
          .select('id, document_id, heading, content, position')
          .eq('assistant_id', assistantId)
          .order('id')
          .range(from, from + PAGE_SIZE - 1),
        'load the indexed passages',
      ) ?? [];

    passages.push(
      ...rows.map((row) => ({
        id: row.id,
        documentId: row.document_id,
        heading: row.heading,
        content: row.content,
        position: row.position,
      })),
    );

    if (rows.length < PAGE_SIZE) {
      break;
    }
  }

  return { documents: documents satisfies LiveDocument[], passages };
};

/**
 * Moves every saved citation of a page that re-indexing replaced to the page indexed now under
 * the same title, so no answer's source opens "This page is not in the knowledge anymore".
 */
const repointSavedCitations = async (service: Service, assistantId: string) => {
  const { documents, passages } = await loadKnowledge(service, assistantId);

  for (let from = 0; ; from += PAGE_SIZE) {
    const rows =
      must(
        await service
          .from('messages')
          .select('id, citations')
          .eq('assistant_id', assistantId)
          .eq('role', 'assistant')
          .order('id')
          .range(from, from + PAGE_SIZE - 1),
        'load the saved answers',
      ) ?? [];

    for (const row of rows) {
      if (!Array.isArray(row.citations) || row.citations.length === 0) {
        continue;
      }

      const result = repointCitations(row.citations, documents, passages);

      summary.citations.unresolved += result.unresolved;

      if (result.changed > 0) {
        must(
          await service
            .from('messages')
            .update({ citations: result.citations as Json })
            .eq('id', row.id),
          'update a saved answer',
        );
        summary.citations.changed += result.changed;
        summary.citations.answers += 1;
      }
    }

    if (rows.length < PAGE_SIZE) {
      break;
    }
  }
};

const readUsage = async (service: Service, ownerId: string, periodStart: string) => {
  const { data } = await service
    .from('usage_counters')
    .select('value')
    .eq('owner_id', ownerId)
    .eq('metric', 'messages')
    .eq('period_start', periodStart)
    .maybeSingle();

  return Number(data?.value ?? 0);
};

/**
 * This month's answer count after the history is seeded: exactly what the history accounts for
 * after a refresh (every other answer this month was just deleted), or those answers added to
 * what was already counted when the history is seeded for the first time.
 */
const meterHistory = async (
  service: Service,
  ownerId: string,
  answers: number,
  replace: boolean,
  now: Date,
) => {
  const periodStart = usagePeriodStart(now);
  const before = await readUsage(service, ownerId, periodStart);
  const after = replace ? answers : before + answers;

  must(
    await service.from('usage_counters').upsert(
      {
        owner_id: ownerId,
        metric: 'messages',
        period_start: periodStart,
        value: after,
        updated_at: now.toISOString(),
      },
      { onConflict: 'owner_id,metric,period_start' },
    ),
    "set this month's answer count",
  );

  summary.usage = { before, after };
};

const seedHistory = async (
  service: Service,
  ownerId: string,
  assistantId: string,
  replace: boolean,
) => {
  const existing = await countHistory(service, assistantId);

  if (!replace && existing.conversations > 0) {
    log('history already present, leaving it alone (--refresh-history replaces it)');

    return;
  }

  const now = new Date();
  const { documents, passages } = await loadKnowledge(service, assistantId);
  const scheduled = scheduleHistory(EXCHANGES, now);
  const model = hasLiveAiProvider()
    ? process.env.GEMINI_CHAT_MODEL?.trim() || 'gemini-3.5-flash-lite'
    : 'stub-1';
  const conversations: Database['public']['Tables']['conversations']['Insert'][] = [];
  const messages: Database['public']['Tables']['messages']['Insert'][] = [];
  let leadConversation: { id: string; at: Date } | null = null;
  let uncited = 0;

  for (const [index, { exchange, askedAt, answeredAt, latencyMs }] of scheduled.entries()) {
    const channel = exchange.channel ?? 'widget';
    const conversationId = crypto.randomUUID();
    const answered = exchange.answer !== null;
    const citation = citationFor(exchange, documents, passages);

    if (exchange.doc && !citation) {
      uncited += 1;
      log(
        `no indexed page titled "${exchange.doc}"; "${exchange.question}" is saved without a citation`,
      );
    }

    conversations.push({
      id: conversationId,
      assistant_id: assistantId,
      owner_id: ownerId,
      channel,
      visitor_id: channel === 'widget' ? `demo_${index.toString().padStart(2, '0')}_visitor` : null,
      page_url: channel === 'widget' ? (exchange.page ?? null) : null,
      title: exchange.question.slice(0, 60),
      created_at: askedAt.toISOString(),
    });

    messages.push(
      {
        conversation_id: conversationId,
        assistant_id: assistantId,
        owner_id: ownerId,
        role: 'user',
        content: exchange.question,
        created_at: askedAt.toISOString(),
      },
      {
        conversation_id: conversationId,
        assistant_id: assistantId,
        owner_id: ownerId,
        role: 'assistant',
        content: answered ? exchange.answer! : UNANSWERED_TEXT,
        answered,
        citations: (citation ? [citation] : []) as Json,
        feedback: exchange.feedback ?? null,
        model,
        latency_ms: latencyMs,
        prompt_tokens: 600 + ((index * 53) % 400),
        completion_tokens: answered ? 80 + ((index * 17) % 90) : 30,
        created_at: answeredAt.toISOString(),
      },
    );

    // The lead comes from this week's first unanswered widget question, so the Overview's
    // default week shows it waiting for a reply.
    if (!answered && channel === 'widget' && exchange.daysAgo < 7 && !leadConversation) {
      leadConversation = { id: conversationId, at: answeredAt };
    }
  }

  const conversationIds = conversations.map(({ id }) => id!);
  const leadIds: string[] = [];

  try {
    // Rows of one batch share its columns: a key left out would be written as null, not as the
    // column's default, so defaults are asked for explicitly.
    must(
      await service.from('conversations').insert(conversations, { defaultToNull: false }),
      'save the conversations',
    );
    // In order, so each conversation's last activity is its answer.
    must(
      await service.from('messages').insert(messages, { defaultToNull: false }),
      'save the messages',
    );

    if (leadConversation) {
      const lead = must(
        await service
          .from('leads')
          .insert({
            assistant_id: assistantId,
            owner_id: ownerId,
            conversation_id: leadConversation.id,
            email: 'maya@northwind.dev',
            note: 'We would switch from our current tool if there were a Slack integration.',
            page_url: 'https://docs.example.com/integrations',
            status: 'new',
            created_at: new Date(leadConversation.at.getTime() + 90_000).toISOString(),
          })
          .select('id')
          .single(),
        'save the lead',
      );

      leadIds.push(lead!.id);
    }
  } catch (cause) {
    // Half a history is worse than the old one: take back what was written, keep what was there.
    await service.from('conversations').delete().in('id', conversationIds);
    throw cause;
  }

  if (replace) {
    const left = await deleteOldHistory(service, assistantId, {
      conversations: conversationIds,
      leads: leadIds,
    });

    summary.deleted = existing;

    if (left !== conversationIds.length) {
      log(
        `note: ${formatCount(left)} conversations after the refresh, not ${formatCount(conversationIds.length)}; someone may have used the demo while it ran`,
      );
    }
  }

  await meterHistory(service, ownerId, answersThisMonth(scheduled, now), replace, now);

  summary.created = {
    conversations: conversations.length,
    messages: messages.length,
    leads: leadConversation ? 1 : 0,
    uncited,
  };
  log(
    `seeded the history from ${scheduled[0]!.askedAt.toISOString().slice(0, 10)} to ${scheduled.at(-1)!.askedAt.toISOString().slice(0, 10)}`,
  );
};

const writeEnv = async (publicKey: string) => {
  const line = `NEXT_PUBLIC_DEMO_ASSISTANT_KEY=${publicKey}`;

  try {
    const current = await readFile(ENV_FILE, 'utf8');
    const next = /^NEXT_PUBLIC_DEMO_ASSISTANT_KEY=.*$/m.test(current)
      ? current.replace(/^NEXT_PUBLIC_DEMO_ASSISTANT_KEY=.*$/m, line)
      : `${current.trimEnd()}\n${line}\n`;

    await writeFile(ENV_FILE, next);
    log(`wrote ${line} to .env (restart the dev server to pick it up)`);
  } catch (cause) {
    log(`could not write .env: ${cause instanceof Error ? cause.message : 'unknown error'}`);
  }
};

const printSummary = () => {
  const { docs, deleted, created, citations, usage } = summary;

  console.info('\nSummary');
  log(
    `docs: ${formatCount(docs.indexed)} re-indexed, ${formatCount(docs.unchanged)} unchanged${docs.failed ? `, ${formatCount(docs.failed)} failed` : ''}`,
  );

  if (deleted) {
    log(
      `deleted: ${plural(deleted.conversations, 'conversation')} (${plural(deleted.messages, 'message')}, ${plural(deleted.stops, 'stop')}, ${plural(deleted.references, 'reference')}), ${plural(deleted.leads, 'lead')}, ${plural(deleted.projects, 'chat project')}`,
    );
  }

  if (created) {
    log(
      `created: ${plural(created.conversations, 'conversation')} (${plural(created.messages, 'message')}), ${plural(created.leads, 'lead')}${created.uncited ? `; ${plural(created.uncited, 'answer')} without a citation` : ''}`,
    );
  }

  if (!deleted) {
    log(
      `citations: ${formatCount(citations.changed)} moved to re-indexed pages, in ${plural(citations.answers, 'answer')}${citations.unresolved ? `; ${formatCount(citations.unresolved)} point at a page no longer indexed under any title` : ''}`,
    );
  }

  if (usage) {
    log(`answers this month: ${usage.before} -> ${usage.after}`);
  }
};

const main = async () => {
  // Before anything is written: a refused combination must leave the demo as it is.
  const flags = parseSeedFlags(process.argv.slice(2));
  const service = createClient<Database>(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  console.info('Seeding the Parbot demo');
  const ownerId = await ensureDemoUser(service);
  await putOnStarter(service, ownerId);
  const assistant = await ensureAssistant(service, ownerId, flags.reset);
  await indexDocs(service, ownerId, assistant.id);

  if (flags.refreshHistory) {
    await seedHistory(service, ownerId, assistant.id, true);
  } else {
    await repointSavedCitations(service, assistant.id);

    if (flags.history) {
      await seedHistory(service, ownerId, assistant.id, false);
    }
  }

  printSummary();
  console.info(`\nDemo assistant public key: ${assistant.public_key}`);
  console.info(`Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  if (flags.writeEnv) {
    await writeEnv(assistant.public_key);
  } else {
    console.info(
      `Set NEXT_PUBLIC_DEMO_ASSISTANT_KEY=${assistant.public_key} to power the landing demo.`,
    );
  }
};

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
