import { expect, type Frame, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { stubEmbedding } from '../src/lib/ai/stub';

import { reload, visit } from './support/navigation';

/**
 * The public demo page with the real widget on it, against the stub provider. The spec seeds
 * its own Starter account with an assistant and two indexed chunks, and deletes the account
 * afterwards, so it never depends on demo data or touches another account.
 */

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = 'e2e-widget-pass-1';

type Seeded = {
  admin: SupabaseClient;
  userId: string;
  email: string;
  assistantId: string;
  publicKey: string;
};

const seed = async (): Promise<Seeded | null> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const tag = unique();
  const email = `e2e-widget-${tag}@parbot.test`;
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (userError || !created.user) {
    throw new Error(`Could not create the e2e account: ${userError?.message}`);
  }

  const userId = created.user.id;
  await admin
    .from('subscriptions')
    .update({ plan_id: 'starter', status: 'active', billing_interval: 'monthly' })
    .eq('account_id', userId);

  const { data: assistant } = await admin
    .from('assistants')
    .insert({
      owner_id: userId,
      name: 'Northwind docs',
      slug: `e2e-widget-${tag}`,
      welcome_message: 'Ask me anything about Northwind.',
      suggested_questions: ['What is the rate limit?'],
      mode: 'bubble',
      lead_capture: true,
    })
    .select('id, public_key')
    .single();

  if (!assistant) {
    throw new Error('Could not create the e2e assistant.');
  }

  const { data: source } = await admin
    .from('sources')
    .insert({
      assistant_id: assistant.id,
      owner_id: userId,
      kind: 'text',
      title: 'Northwind API guide',
      storage_path: `${userId}/${assistant.id}/guide.md`,
      status: 'ready',
    })
    .select('id')
    .single();

  const chunks = [
    'The rate limit is 600 requests per minute per API key. Requests over the limit return status 429 with a Retry-After header.',
    'Batch endpoints count as one request regardless of how many items they carry, so batching is the way to stay under the rate limit.',
  ];
  const content = chunks.join('\n\n');
  const { data: document } = await admin
    .from('documents')
    .insert({
      assistant_id: assistant.id,
      owner_id: userId,
      source_id: source!.id,
      url: 'https://docs.northwind.dev/rate-limits',
      title: 'Rate limits',
      content,
      checksum: `e2e-${tag}`,
      token_count: Math.ceil(content.length / 4),
    })
    .select('id')
    .single();

  await admin.from('chunks').insert(
    chunks.map((text, position) => ({
      assistant_id: assistant.id,
      owner_id: userId,
      document_id: document!.id,
      position,
      heading: 'Rate limits',
      content: text,
      token_count: Math.ceil(text.length / 4),
      embedding: JSON.stringify(stubEmbedding(text)),
    })),
  );

  return { admin, userId, email, assistantId: assistant.id, publicKey: assistant.public_key };
};

// The widget lives in a shadow root; Playwright's selectors pierce it.
const widget = (page: Page | Frame, selector: string) => page.locator(`#parbot-widget ${selector}`);

test.describe('widget on the demo page', () => {
  let seeded: Seeded | null = null;

  test.beforeAll(async () => {
    seeded = await seed();
  });

  test.afterAll(async () => {
    if (seeded) {
      await seeded.admin.auth.admin.deleteUser(seeded.userId);
    }
  });

  test('the bubble answers a question with sources', async ({ page }) => {
    test.skip(!seeded, 'Needs the Supabase service role key from apps/web/.env');

    await visit(page, `/demo/${seeded!.publicKey}`);
    // The assistant is already named after its docs, so the stand-in site says "docs" once.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Example docs for Northwind');
    await expect(page.getByRole('banner')).toContainText('Northwind docs');
    await expect(page.getByRole('banner')).not.toContainText(/docs docs/i);
    await expect(page).toHaveTitle(/Example docs for Northwind\b(?! docs)/);

    const launcher = widget(page, '.pb-launcher');
    await expect(launcher).toHaveAttribute('aria-label', 'Open Northwind docs');
    await launcher.click();

    const panel = widget(page, '.pb-panel');
    await expect(panel).toHaveAttribute('role', 'dialog');
    await expect(panel).toHaveClass(/pb-open/);

    await widget(page, '.pb-chip').first().click();
    await expect(widget(page, '.pb-user')).toHaveText('What is the rate limit?');
    await expect(widget(page, '.pb-item-assistant .pb-body')).toContainText('600', {
      timeout: 15_000,
    });

    const source = widget(page, '.pb-sources a').first();
    await expect(source).toHaveAttribute('href', 'https://docs.northwind.dev/rate-limits');
    await expect(source).toHaveAttribute('target', '_blank');

    await page.keyboard.press('Escape');
    await expect(panel).not.toHaveClass(/pb-open/);
  });

  test('the palette opens on Cmd+K and offers a lead form when the docs fall short', async ({
    page,
  }) => {
    test.skip(!seeded, 'Needs the Supabase service role key from apps/web/.env');

    await visit(page, `/demo/${seeded!.publicKey}?mode=palette`);
    await expect(widget(page, '.pb-launcher')).toContainText('Ask AI');

    await page.keyboard.press('Meta+K');
    const panel = widget(page, '.pb-panel');
    await expect(panel).toHaveClass(/pb-open/);
    await expect(panel).toHaveAttribute('aria-modal', 'true');
    // The modal has its own close button, so the pill does not float beside it.
    await expect(widget(page, '.pb-launcher')).toBeHidden();

    const input = widget(page, 'textarea');
    await input.fill('Could you tell me about the weather forecast for Mars next week please');
    await input.press('Enter');

    const form = widget(page, 'form.pb-lead');
    await expect(form).toBeVisible({ timeout: 15_000 });
    // A bad address is caught in the widget's own hint, in its theme, not in the browser's bubble.
    await form.locator('input[name=email]').fill('not-an-email');
    await form.locator('button[type=submit]').click();
    await expect(form.locator('.pb-hint')).toHaveText('Check the email address and retry.');
    await form.locator('input[name=email]').fill('ada@example.com');
    await form.locator('button[type=submit]').click();
    await expect(widget(page, '.pb-thanks')).toHaveText(
      'Thanks. The team will reply to ada@example.com.',
    );

    const { data: leads } = await seeded!.admin
      .from('leads')
      .select('email')
      .eq('assistant_id', seeded!.assistantId);
    expect(leads).toEqual([{ email: 'ada@example.com' }]);

    await page.keyboard.press('Escape');
    await expect(panel).not.toHaveClass(/pb-open/);
    await expect(widget(page, '.pb-launcher')).toBeVisible();
  });

  test('the widget limits live in the database every server instance shares', async ({
    request,
  }) => {
    test.skip(!seeded, 'Needs the Supabase service role key from apps/web/.env');

    const visitorId = `v_e2e_${unique()}`;
    const bucket = `widget:visitor:${seeded!.assistantId}:${visitorId}`;
    const ask = () =>
      request.post('/api/widget/chat', {
        data: {
          key: seeded!.publicKey,
          visitorId,
          conversationId: crypto.randomUUID(),
          message: 'What is the rate limit?',
        },
      });
    const hits = async () => {
      const { data } = await seeded!.admin
        .from('rate_limits')
        .select('hits')
        .eq('bucket', bucket)
        .maybeSingle();

      return (data?.hits as string[] | undefined)?.length ?? 0;
    };

    try {
      // A message this server answered is counted in the shared table, not in its own memory.
      const answered = await ask();
      expect(answered.status()).toBe(200);
      await answered.text();
      expect(await hits()).toBe(1);

      // Another instance takes the rest of the visitor's minute; this server sees it at once.
      for (let index = 0; index < 11; index += 1) {
        const { data, error } = await seeded!.admin.rpc('take_rate_limit', {
          bucket,
          max_hits: 12,
          window_ms: 60_000,
        });
        expect(error).toBeNull();
        expect(data).toEqual([{ allowed: true, retry_after_ms: 0 }]);
      }

      const limited = await ask();
      expect(limited.status()).toBe(429);
      expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0);
      expect(await limited.json()).toMatchObject({ error: { code: 'rate_limited' } });
      expect(await hits()).toBe(12);
    } finally {
      await seeded!.admin.from('rate_limits').delete().eq('bucket', bucket);
    }
  });

  test('an unknown key is a real 404 with a way out', async ({ page }) => {
    const response = await visit(page, '/demo/pb_ffffffffffffffffffffffffffffffff');

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No assistant has this key');
    await expect(page.getByRole('link', { name: 'Go to the dashboard' })).toBeVisible();
  });

  test('the live preview shows after a full page load and a reload', async ({ page }) => {
    test.skip(!seeded, 'Needs the Supabase service role key from apps/web/.env');

    await visit(page, '/login');
    await page.getByLabel(/email/i).fill(seeded!.email);
    await page.getByLabel(/^password/i).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/(dashboard|a\/)/);

    // The page's own scripts are held back, so the preview frame finishes loading before React
    // hydrates, as it does on a slow machine. That once left the skeleton over it for good.
    await page.route('**/_next/static/**', async (route) => {
      const request = route.request();

      if (request.frame() === page.mainFrame() && request.resourceType() === 'script') {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      await route.continue();
    });

    const frame = page.locator('iframe[title="Widget preview"]');

    await visit(page, `/a/${seeded!.assistantId}/widget`);
    await expect(frame).toHaveCSS('opacity', '1', { timeout: 10_000 });

    await reload(page);
    await expect(frame).toHaveCSS('opacity', '1', { timeout: 10_000 });
    await expect(
      page.frameLocator('iframe[title="Widget preview"]').locator('#parbot-widget'),
    ).toBeAttached();

    await page.unrouteAll({ behavior: 'wait' });
  });

  test('a saved theme shows in the settings preview at once', async ({ page }) => {
    test.skip(!seeded, 'Needs the Supabase service role key from apps/web/.env');

    await visit(page, '/login');
    await page.getByLabel(/email/i).fill(seeded!.email);
    await page.getByLabel(/^password/i).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/(dashboard|a\/)/);

    await visit(page, `/a/${seeded!.assistantId}/widget`);
    await expect(page.getByRole('heading', { name: 'Widget' })).toBeVisible();
    // A production server can stream the snippet in before React swaps it into place, so two
    // copies exist for a moment; either one carries the key.
    await expect(page.locator('pre code').first()).toContainText(
      `data-parbot="${seeded!.publicKey}"`,
    );

    await page.getByRole('button', { name: 'Use #16a34a' }).click();
    await page.locator('label', { hasText: 'Light' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Widget settings saved')).toBeVisible();

    const frame = page.frameLocator('iframe[title="Widget preview"]');
    await expect(frame.locator('#parbot-widget .pb-panel.pb-open')).toBeAttached({
      timeout: 20_000,
    });
    const preview = page.frames().find((candidate) => candidate.url().includes('v=1'));
    expect(preview).toBeDefined();
    await expect
      .poll(() =>
        preview!.evaluate(() => {
          const root = document
            .getElementById('parbot-widget')
            ?.shadowRoot?.querySelector<HTMLElement>('.pb-root');

          return root
            ? { accent: root.style.getPropertyValue('--pb-accent'), scheme: root.dataset.scheme }
            : null;
        }),
      )
      .toEqual({ accent: '#16a34a', scheme: 'light' });
  });
});
