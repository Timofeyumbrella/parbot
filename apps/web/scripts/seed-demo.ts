/**
 * Seeds the demo: the demo account on Starter, a "Parbot Docs" assistant trained on
 * apps/web/content/docs, and with --history two weeks of realistic conversations plus a lead.
 *
 *   pnpm --filter web seed:demo                 docs only, re-indexes on every run
 *   pnpm --filter web seed:demo --history       docs plus inbox history (skipped if history exists)
 *   pnpm --filter web seed:demo --reset         delete the demo assistant first
 *   pnpm --filter web seed:demo --write-env     also write NEXT_PUBLIC_DEMO_ASSISTANT_KEY into .env
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
import type { Database } from '../src/lib/db';
import { ingestSource } from '../src/lib/ingest';
import { demoAppUrl, demoExchanges } from './demo-history';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(here, '../content/docs');
const ENV_FILE = path.resolve(here, '../../../.env');

const DEMO_EMAIL = 'demo@parbot.dev';
const DEMO_PASSWORD = 'parbot-demo';
const DEMO_NAME = 'Demo Founder';
const SLUG = 'parbot-docs';

const args = new Set(process.argv.slice(2));
const flag = (name: string) => args.has(`--${name}`);

const required = (name: string) => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name}. Run this from apps/web with the root .env linked in.`);
  }

  return value;
};

const service = createClient<Database>(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

const log = (message: string) => console.info(`  ${message}`);

const EXCHANGES = demoExchanges(demoAppUrl());

const ensureDemoUser = async () => {
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
const putOnStarter = async (ownerId: string) => {
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

const ensureAssistant = async (ownerId: string) => {
  if (flag('reset')) {
    await service.from('assistants').delete().eq('owner_id', ownerId).eq('slug', SLUG);
    log('deleted the previous demo assistant');
  }

  const { data: existing } = await service
    .from('assistants')
    .select('id, public_key')
    .eq('owner_id', ownerId)
    .eq('slug', SLUG)
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

const indexDocs = async (ownerId: string, assistantId: string) => {
  const provider = getAiProvider();
  const files = (await readdir(DOCS_DIR)).filter((name) => name.endsWith('.md')).sort();

  log(`indexing ${files.length} docs on the ${hasLiveAiProvider() ? 'Gemini' : 'stub'} provider`);

  for (const file of files) {
    const markdown = await readFile(path.join(DOCS_DIR, file), 'utf8');
    const title = titleOf(markdown, file.replace(/^\d+-/, '').replace(/\.md$/, ''));

    const { data: known } = await service
      .from('sources')
      .select('id, storage_path')
      .eq('assistant_id', assistantId)
      .eq('title', title)
      .maybeSingle();

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
    }

    await ingestSource({ service, provider, sourceId });

    const { data: source } = await service
      .from('sources')
      .select('status, chunk_count, error')
      .eq('id', sourceId)
      .single();

    log(
      `${title}: ${source?.status ?? 'unknown'}${source?.chunk_count ? `, ${source.chunk_count} passages` : ''}${source?.error ? `, ${source.error}` : ''}`,
    );
  }
};

const UNANSWERED_TEXT =
  "I couldn't find that in the documentation, so I'd rather not guess. Try rephrasing, or ask about something the docs cover.";

const seedHistory = async (ownerId: string, assistantId: string) => {
  const { count } = await service
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('assistant_id', assistantId);

  if ((count ?? 0) > 0 && !flag('reset')) {
    log('history already present, leaving it alone');

    return;
  }

  const { data: documents } = await service
    .from('documents')
    .select('id, title, content')
    .eq('assistant_id', assistantId);
  const byTitle = new Map((documents ?? []).map((document) => [document.title, document]));

  const now = Date.now();
  let leadConversation: string | null = null;

  for (const [index, exchange] of EXCHANGES.entries()) {
    const daysAgo = 13 - Math.floor((index / EXCHANGES.length) * 13);
    const askedAt = new Date(
      now - daysAgo * 24 * 60 * 60 * 1000 - ((index * 37) % 11) * 60 * 60 * 1000,
    );
    const answeredAt = new Date(askedAt.getTime() + 2_200);
    const channel = exchange.channel ?? 'widget';
    const conversationId = crypto.randomUUID();

    await service.from('conversations').insert({
      id: conversationId,
      assistant_id: assistantId,
      owner_id: ownerId,
      channel,
      visitor_id: channel === 'widget' ? `demo_${index.toString().padStart(2, '0')}_visitor` : null,
      page_url: channel === 'widget' ? (exchange.page ?? null) : null,
      title: exchange.question.slice(0, 60),
      created_at: askedAt.toISOString(),
    });

    await service.from('messages').insert({
      conversation_id: conversationId,
      assistant_id: assistantId,
      owner_id: ownerId,
      role: 'user',
      content: exchange.question,
      created_at: askedAt.toISOString(),
    });

    const document = exchange.doc ? byTitle.get(exchange.doc) : undefined;
    const answered = exchange.answer !== null;

    await service.from('messages').insert({
      conversation_id: conversationId,
      assistant_id: assistantId,
      owner_id: ownerId,
      role: 'assistant',
      content: answered ? exchange.answer! : UNANSWERED_TEXT,
      answered,
      citations:
        answered && document
          ? [
              {
                index: 1,
                documentId: document.id,
                title: document.title,
                url: null,
                snippet: document.content.replace(/\s+/g, ' ').slice(0, 200),
              },
            ]
          : [],
      feedback: exchange.feedback ?? null,
      model: hasLiveAiProvider() ? 'gemini-3.5-flash-lite' : 'stub-1',
      latency_ms: 900 + ((index * 131) % 1400),
      prompt_tokens: 600 + ((index * 53) % 400),
      completion_tokens: answered ? 80 + ((index * 17) % 90) : 30,
      created_at: answeredAt.toISOString(),
    });

    if (!answered && !leadConversation) {
      leadConversation = conversationId;
    }
  }

  if (leadConversation) {
    await service.from('leads').insert({
      assistant_id: assistantId,
      owner_id: ownerId,
      conversation_id: leadConversation,
      email: 'maya@northwind.dev',
      note: 'We would switch from our current tool if there were a Slack integration.',
      page_url: 'https://docs.example.com/integrations',
      status: 'new',
    });
  }

  log(`seeded ${EXCHANGES.length} conversations and 1 lead`);
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

const main = async () => {
  console.info('Seeding the Parbot demo');
  const ownerId = await ensureDemoUser();
  await putOnStarter(ownerId);
  const assistant = await ensureAssistant(ownerId);
  await indexDocs(ownerId, assistant.id);

  if (flag('history')) {
    await seedHistory(ownerId, assistant.id);
  }

  console.info(`\nDemo assistant public key: ${assistant.public_key}`);
  console.info(`Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  if (flag('write-env')) {
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
