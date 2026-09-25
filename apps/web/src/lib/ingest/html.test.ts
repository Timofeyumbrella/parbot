// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { cleanTitle, htmlToMarkdown } from './html';

const FIXTURE = `<!doctype html>
<html>
  <head>
    <title>Authentication | Example Docs</title>
    <meta property="og:title" content="Authentication" />
    <script>window.analytics = {};</script>
    <style>.hidden { display: none }</style>
  </head>
  <body>
    <nav><a href="/">Home</a><a href="/guide/intro">Guide</a><a href="/pricing">Pricing nav link</a></nav>
    <aside>Sidebar promo you should not read.</aside>
    <main>
      <article>
        <h1>Authentication</h1>
        <p>Every request carries an <strong>API key</strong>. Create one under <a href="/settings/keys">Settings</a>.</p>
        <h2>Sending the key</h2>
        <p>Add the header shown below to each request. Keys are long-lived until you rotate them from the same screen.</p>
        <pre><code class="language-ts">const res = await fetch(url, {
  headers: { authorization: \`Bearer \${key}\` },
});</code></pre>
        <h2>Scopes</h2>
        <ul>
          <li>read: list resources</li>
          <li>write: change resources</li>
        </ul>
        <p>Scopes are set when the key is created and cannot change afterwards. Create a new key if you need more.</p>
        <table><tr><th>Scope</th><th>Allows</th></tr><tr><td>read</td><td>GET</td></tr></table>
      </article>
    </main>
    <footer>Copyright Example Inc. <a href="/legal">Legal</a></footer>
  </body>
</html>`;

describe('htmlToMarkdown', () => {
  const result = htmlToMarkdown(FIXTURE, { baseUrl: 'https://docs.example.com/guide/auth' });

  it('takes the title from og:title first', () => {
    expect(result.title).toBe('Authentication');
  });

  it('drops navigation, sidebars, footers, scripts and styles', () => {
    expect(result.markdown).not.toContain('Pricing nav link');
    expect(result.markdown).not.toContain('Sidebar promo');
    expect(result.markdown).not.toContain('Copyright Example');
    expect(result.markdown).not.toContain('window.analytics');
    expect(result.markdown).not.toContain('display: none');
  });

  it('puts the title back as the level one heading when Readability removed it', () => {
    expect(result.markdown.startsWith('# Authentication\n\n')).toBe(true);
    expect(result.markdown.match(/^# /gm)).toHaveLength(1);
  });

  it('writes headings, a fenced code block with its language, lists, links and tables', () => {
    expect(result.markdown).toContain('## Sending the key');
    expect(result.markdown).toContain('## Scopes');
    expect(result.markdown).toContain('```ts\nconst res = await fetch(url, {');
    expect(result.markdown).toContain('- read: list resources');
    expect(result.markdown).toContain('[Settings](https://docs.example.com/settings/keys)');
    expect(result.markdown).toContain('| Scope | Allows |');
    expect(result.markdown).toContain('**API key**');
  });

  it('collects every raw link on the page, including the ones in dropped chrome', () => {
    expect(result.links).toEqual(['/', '/guide/intro', '/pricing', '/settings/keys', '/legal']);
  });

  it('falls back to the title tag and then the first heading', () => {
    expect(
      htmlToMarkdown('<html><head><title>Only title</title></head><body><p>x</p></body></html>')
        .title,
    ).toBe('Only title');
    expect(htmlToMarkdown('<html><body><h1>First heading</h1><p>x</p></body></html>').title).toBe(
      'First heading',
    );
    expect(htmlToMarkdown('<p>nothing</p>').title).toBeNull();
  });

  it('keeps the whole body when the page has no main content region and Readability is off', () => {
    const { markdown } = htmlToMarkdown('<h1>Doc</h1><p>Short body.</p>', { readability: false });

    expect(markdown).toBe('# Doc\n\nShort body.');
  });

  it('returns empty Markdown for a page without text', () => {
    expect(htmlToMarkdown('<html><body><script>1</script></body></html>').markdown).toBe('');
  });
});

describe('cleanTitle', () => {
  it('prefers the h1 when the document title merely wraps it', () => {
    expect(cleanTitle('Setup | AuditDocs', 'Setup', null)).toBe('Setup');
    expect(cleanTitle('AuditDocs - Setup', 'Setup', null)).toBe('Setup');
    expect(cleanTitle('Setup', 'Setup', null)).toBe('Setup');
  });

  it('strips a known site name from either end', () => {
    expect(cleanTitle('Webhooks - Example Docs', null, 'Example Docs')).toBe('Webhooks');
    expect(cleanTitle('Example Docs | Webhooks', null, 'Example Docs')).toBe('Webhooks');
    expect(cleanTitle('Example Docs', null, 'Example Docs')).toBe('Example Docs');
  });

  it('drops a trailing site segment after a pipe, dash or dot, but leaves plain hyphens alone', () => {
    expect(cleanTitle('Webhooks | Example', null, null)).toBe('Webhooks');
    expect(cleanTitle('Webhooks — Example', null, null)).toBe('Webhooks');
    expect(cleanTitle('Webhooks · Example', null, null)).toBe('Webhooks');
    expect(cleanTitle('Part 1 - Getting started', null, null)).toBe('Part 1 - Getting started');
    expect(cleanTitle('A | B', null, null)).toBe('A | B');
  });

  it('does not mistake a logo h1 for the page name', () => {
    const html = `<html><head><title>sitemaps.org - Protocol</title></head>
      <body><div id="header"><h1><a href="/">sitemaps.org</a></h1></div>
      <main><h1>Sitemaps XML format</h1><p>This document describes the XML schema for the Sitemap protocol in detail.</p>
      <h2>Entity escaping</h2><p>Your Sitemap file must be UTF-8 encoded and entity escaped.</p></main></body></html>`;
    const result = htmlToMarkdown(html, { baseUrl: 'https://www.sitemaps.org/protocol.html' });

    expect(result.title).toBe('Protocol');
    expect(result.markdown).toContain('# Sitemaps XML format');
    expect(result.markdown).toContain('## Entity escaping');
  });

  it('shapes the heading path and document title of a real page', () => {
    const html = `<html><head><title>Setup | AuditDocs</title><meta property="og:site_name" content="AuditDocs"></head>
      <body><main><article><h1>Setup</h1><p>Install the package with your package manager of choice and run it.</p>
      <h2>Configuration</h2><p>Set the options in the config file before the first run of the tool.</p></article></main></body></html>`;
    const result = htmlToMarkdown(html);

    expect(result.title).toBe('Setup');
    expect(result.markdown.startsWith('# Setup\n\n')).toBe(true);
    expect(result.markdown).toContain('## Configuration');
  });
});
