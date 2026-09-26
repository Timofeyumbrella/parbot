import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { expect, type Page, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { stubEmbedding } from '../src/lib/ai/stub';
import { usagePeriodStart } from '../src/lib/plans';

import { adminClient, removeAccount, testEmail } from './support/accounts';

/**
 * Stop, the way a serverless host treats it. On Vercel the reader's disconnect never reaches the
 * function that streams the answer: it runs to the end, saves and meters the whole answer. Locally
 * `next start` does pass the abort on, which hid the bug, so every request here goes through a
 * small proxy that never passes it on either: when the browser drops /api/chat, the proxy keeps
 * reading the server's stream to the end. It also paces the stream to the browser so Stop can land
 * mid-answer. Only the explicit stop request can make the saved answer match the screen.
 *
 * Runs as a throwaway account, so the usage counter it checks is its own.
 */

const PASSWORD = 'stop-e2e-password';
const QUESTION = 'How do I rotate an API key?';
/** What the stub answers QUESTION with: the first sentence of the best passage, then its marker. */
const FULL_ANSWER = 'API keys are created in Settings under Developer. [1]';
const DOC_URL = 'https://docs.acme.test/auth';

type Pace = { tokenDelayMs: number; holdFinalMs: number };

type ChatRecord = {
  /** Every frame the server sent, whether or not the browser was still there to get it. */
  frames: string[];
  serverDone: Promise<void>;
  browserLeft: boolean;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Forwards everything to the app. /api/chat is re-sent to the browser frame by frame at `pace`,
 * and when the browser goes away the server's side of the request is left running and drained.
 */
const startProxy = async (target: URL) => {
  const chats: ChatRecord[] = [];
  let pace: Pace = { tokenDelayMs: 0, holdFinalMs: 0 };

  const server = http.createServer((request, response) => {
    const isChat = request.method === 'POST' && request.url === '/api/chat';
    const headers = { ...request.headers };

    if (isChat) {
      // Plain text, so the frames can be read and paced.
      delete headers['accept-encoding'];
    }

    const upstream = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        method: request.method,
        path: request.url,
        headers,
      },
      (reply) => {
        response.writeHead(reply.statusCode ?? 502, reply.headers);

        if (!isChat) {
          reply.pipe(response);

          return;
        }

        const current = pace;
        let finished: () => void = () => {};
        const record: ChatRecord = {
          frames: [],
          serverDone: new Promise<void>((resolve) => {
            finished = resolve;
          }),
          browserLeft: false,
        };
        let buffer = '';
        let queue = Promise.resolve();

        chats.push(record);
        response.on('close', () => {
          record.browserLeft = !response.writableFinished;
        });
        reply.setEncoding('utf8');
        reply.on('data', (chunk: string) => {
          buffer += chunk;

          let boundary = buffer.indexOf('\n\n');

          while (boundary !== -1) {
            const frame = buffer.slice(0, boundary + 2);

            buffer = buffer.slice(boundary + 2);
            record.frames.push(frame);
            queue = queue.then(async () => {
              if (frame.includes('"type":"token"')) {
                await wait(current.tokenDelayMs);
              } else if (frame.includes('"type":"citations"')) {
                await wait(current.holdFinalMs);
              }

              if (!record.browserLeft && !response.destroyed) {
                response.write(frame);
              }
            });
            boundary = buffer.indexOf('\n\n');
          }
        });
        reply.on('end', () => {
          finished();
          void queue.then(() => {
            if (!response.destroyed) {
              response.end();
            }
          });
        });
      },
    );

    upstream.on('error', () => response.destroy());
    request.pipe(upstream);
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));

  return {
    origin: `http://localhost:${(server.address() as AddressInfo).port}`,
    chats,
    setPace: (next: Pace) => {
      pace = next;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
};

/** A throwaway account with one assistant and one indexed passage, embedded the way the stub embeds. */
const seed = async (service: SupabaseClient, email: string) => {
  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (error || !created.user) {
    throw new Error(error?.message ?? 'The throwaway account could not be created.');
  }

  const userId = created.user.id;
  const slug = `stop-e2e-${Date.now().toString(36)}`;
  const { data: assistant } = await service
    .from('assistants')
    .insert({ owner_id: userId, name: 'Acme Docs (stop e2e)', slug })
    .select('id')
    .single();
  const { data: source } = await service
    .from('sources')
    .insert({
      assistant_id: assistant!.id,
      owner_id: userId,
      kind: 'text',
      title: 'Handbook',
      storage_path: slug,
      status: 'ready',
    })
    .select('id')
    .single();
  const passage =
    'API keys are created in Settings under Developer. Rotate an API key from the same screen.';
  const { data: document } = await service
    .from('documents')
    .insert({
      assistant_id: assistant!.id,
      owner_id: userId,
      source_id: source!.id,
      title: 'Authentication',
      url: DOC_URL,
      content: passage,
      checksum: slug,
    })
    .select('id')
    .single();

  await service.from('chunks').insert({
    assistant_id: assistant!.id,
    owner_id: userId,
    document_id: document!.id,
    position: 0,
    heading: 'API keys',
    content: passage,
    embedding: JSON.stringify(stubEmbedding(passage)),
  });

  return { userId, assistantId: assistant!.id as string };
};

const composer = (page: Page) => page.getByRole('textbox', { name: 'Message' });
const assistantBubble = (page: Page, status: string) =>
  page.locator(`[data-role="assistant"][data-status="${status}"]`);

const CONVERSATION_URL = /\/chat\/([0-9a-f-]{36})$/;

test.describe.configure({ mode: 'serial' });

test.describe('Stop when the server never hears the reader leave', () => {
  let service: SupabaseClient;
  let proxy: Awaited<ReturnType<typeof startProxy>>;
  let email: string;
  let userId: string;
  let assistantId: string;
  let page: Page;

  const usage = async () => {
    const { data } = await service
      .from('usage_counters')
      .select('value')
      .eq('owner_id', userId)
      .eq('metric', 'messages')
      .eq('period_start', usagePeriodStart())
      .maybeSingle();

    return Number(data?.value ?? 0);
  };

  const storedAnswer = async (conversationId: string) => {
    const { data } = await service
      .from('messages')
      .select('content, answered, citations')
      .eq('conversation_id', conversationId)
      .eq('role', 'assistant');

    return data?.[0] ?? null;
  };

  test.beforeAll(async ({ browser }, testInfo) => {
    const admin = adminClient();

    if (!admin) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed here.');
    }

    service = admin;
    email = testEmail('stop-e2e');
    ({ userId, assistantId } = await seed(service, email));
    proxy = await startProxy(new URL(testInfo.project.use.baseURL!));
    page = await browser.newPage();

    // Everything, sign-in included, goes through the proxy.
    await page.goto(`${proxy.origin}/login?next=${encodeURIComponent(`/a/${assistantId}/chat`)}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByTestId('welcome')).toBeVisible();
  });

  test.afterAll(async () => {
    await page?.close();
    await proxy?.close();

    if (email) {
      await removeAccount(email);
    }
  });

  test('Stop mid-answer: the saved answer is what the reader saw, unmetered, and reads Stopped after a reload', async () => {
    proxy.setPace({ tokenDelayMs: 400, holdFinalMs: 0 });

    const before = await usage();

    await page.goto(`${proxy.origin}/a/${assistantId}/chat`);
    await composer(page).fill(QUESTION);
    await composer(page).press('Enter');

    const streaming = assistantBubble(page, 'streaming');

    await expect(streaming).toContainText('API keys are created', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Stop' }).click();

    // The reader gets the composer back at once, without waiting on the stop request.
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 500 });

    const stopped = assistantBubble(page, 'stopped');

    await expect(stopped).toContainText('Stopped');

    const shown = (await stopped.locator('.answer-prose').innerText()).trim();

    expect(shown.startsWith('API keys are created')).toBe(true);
    expect(shown.length).toBeLessThan(FULL_ANSWER.length);
    await expect(page).toHaveURL(CONVERSATION_URL);

    const conversationId = page.url().match(CONVERSATION_URL)![1]!;
    const chat = proxy.chats.at(-1)!;

    // The server never heard the browser leave: it streamed and saved the whole answer.
    await chat.serverDone;
    await expect.poll(() => chat.browserLeft).toBe(true);
    expect(chat.frames.some((frame) => frame.includes('"type":"done"'))).toBe(true);

    // Yet the stored answer is the one on screen, stopped, and the month's count is unchanged.
    await expect
      .poll(() => storedAnswer(conversationId), { timeout: 10_000 })
      .toEqual({
        content: shown,
        answered: null,
        citations: [],
      });
    expect(await usage()).toBe(before);

    await page.reload();

    const reloaded = assistantBubble(page, 'stopped');

    await expect(reloaded).toBeVisible();
    await expect(reloaded.locator('.answer-prose')).toHaveText(shown);
    await expect(reloaded).toContainText('Stopped');
    await expect(assistantBubble(page, 'complete')).toHaveCount(0);
  });

  test('Stop after the text but before its sources: bare markers go, and a reload brings the sources', async () => {
    proxy.setPace({ tokenDelayMs: 20, holdFinalMs: 8000 });

    const before = await usage();

    await page.goto(`${proxy.origin}/a/${assistantId}/chat`);
    await composer(page).fill(QUESTION);
    await composer(page).press('Enter');

    await expect(assistantBubble(page, 'streaming')).toContainText('[1]', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Stop' }).click();

    const stopped = assistantBubble(page, 'stopped');

    await expect(stopped).toContainText('Stopped');
    // No citations arrived, so the marker is not left behind as a bare [1].
    await expect(stopped.locator('.answer-prose')).toHaveText(
      'API keys are created in Settings under Developer.',
    );
    await expect(stopped.getByTestId('sources')).toHaveCount(0);
    await expect(page).toHaveURL(CONVERSATION_URL);

    const conversationId = page.url().match(CONVERSATION_URL)![1]!;

    await expect
      .poll(async () => (await storedAnswer(conversationId))?.answered, { timeout: 10_000 })
      .toBeNull();
    expect(await storedAnswer(conversationId)).toEqual({
      content: FULL_ANSWER,
      answered: null,
      citations: [expect.objectContaining({ index: 1, title: 'Authentication', url: DOC_URL })],
    });
    expect(await usage()).toBe(before);

    await page.reload();

    const reloaded = assistantBubble(page, 'stopped');

    await expect(reloaded).toContainText('Stopped');
    await expect(reloaded.locator('sup[data-citation="1"] a')).toHaveAttribute('href', DOC_URL);
    await expect(reloaded.getByTestId('sources')).toContainText('Authentication');
  });
});
