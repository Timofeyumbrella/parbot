// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEPLOYED_APP_URL } from '../src/lib/env';
import { demoAppUrl, demoExchanges } from './demo-history';

const DOCS_DIR = fileURLToPath(new URL('../content/docs', import.meta.url));
/** No parbot.dev host resolves; only the mailboxes on that domain are meant to stay. */
const DEAD_HOST = /https?:\/\/(?:[a-z0-9-]+\.)*parbot\.dev\b/;

const docs = readdirSync(DOCS_DIR)
  .filter((name) => name.endsWith('.md'))
  .map((name) => ({ name, text: readFileSync(path.join(DOCS_DIR, name), 'utf8') }));

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
    for (const exchange of demoExchanges(DEPLOYED_APP_URL)) {
      expect(exchange.answer ?? '').not.toMatch(DEAD_HOST);
    }
  });
});
