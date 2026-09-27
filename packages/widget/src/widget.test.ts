import {
  type ChatStreamEvent,
  type Citation,
  encodeSseEvent,
  type WidgetConfig,
  type WidgetScheme,
} from '@parbot/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ask, boot, destroy, resetForTests, setScheme } from './boot';
import { accentText } from './config';

const API = 'https://app.parbot.test';
const KEY = 'pb_testkey0000000000000000000000';

const config: WidgetConfig = {
  assistantId: 'a1',
  name: 'Docs bot',
  welcomeMessage: 'Hi, ask me about the docs.',
  suggestedQuestions: ['Where do I create an API key?', 'How do webhooks work?'],
  mode: 'bubble',
  theme: { scheme: 'dark', accent: '#2563eb', position: 'left', radius: 'lg' },
  hideBranding: false,
  leadCapture: false,
};

const answerEvents = (conversationId: string, answered = true): ChatStreamEvent[] => [
  { type: 'meta', conversationId, userMessageId: 'u1', assistantMessageId: 'a1' },
  { type: 'token', text: answered ? 'API keys are created ' : 'I could not find that ' },
  { type: 'token', text: answered ? 'in **Settings** [1].' : 'in the documentation.' },
  {
    type: 'citations',
    citations: answered
      ? [
          {
            index: 1,
            documentId: 'd1',
            title: 'Authentication',
            url: 'https://docs.example.com/auth',
            snippet: 'API keys',
          },
        ]
      : [],
  },
  { type: 'done', answered, latencyMs: 12 },
];

const sse = (events: ChatStreamEvent[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(': ok\n\n'));

        for (const event of events) {
          controller.enqueue(encoder.encode(encodeSseEvent(event)));
        }

        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } },
  );

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

const installFetch = (overrides: Partial<WidgetConfig> = {}, answered = true): FetchMock => {
  const mock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);

    if (url.startsWith(`${API}/api/widget/config`)) {
      return Response.json({ ...config, ...overrides });
    }

    if (url === `${API}/api/widget/chat`) {
      const body = JSON.parse(String(init?.body)) as { conversationId: string };

      return sse(answerEvents(body.conversationId, answered));
    }

    if (url === `${API}/api/widget/lead`) {
      return Response.json({ ok: true }, { status: 201 });
    }

    return new Response('not found', { status: 404 });
  });

  vi.stubGlobal('fetch', mock);

  return mock;
};

const mountScript = (attributes: Record<string, string> = {}) => {
  const script = document.createElement('script');
  script.setAttribute('src', `${API}/widget.js`);
  script.setAttribute('data-parbot', KEY);

  for (const [name, value] of Object.entries(attributes)) {
    script.setAttribute(name, value);
  }

  document.head.append(script);

  return script;
};

const shadowOf = (widget: { shadow: ShadowRoot }) => widget.shadow;

const press = (target: Element | Document, key: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init }),
  );

describe('widget', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    resetForTests();
    vi.unstubAllGlobals();
  });

  it('mounts a launcher, sends a question and streams the answer with sources', async () => {
    const fetchMock = installFetch();
    const widget = await boot(mountScript());

    expect(widget).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/api/widget/config?key=${KEY}`,
      expect.anything(),
    );

    const shadow = shadowOf(widget!);
    const root = shadow.querySelector<HTMLElement>('.pb-root')!;
    expect(root.dataset).toMatchObject({
      mode: 'bubble',
      scheme: 'dark',
      position: 'left',
      radius: 'lg',
    });
    expect(root.style.getPropertyValue('--pb-accent')).toBe('#2563eb');

    const launcher = shadow.querySelector<HTMLButtonElement>('.pb-launcher')!;
    expect(launcher.getAttribute('aria-label')).toBe('Open Docs bot');
    expect(launcher.className).toContain('pb-round');

    const panel = shadow.querySelector<HTMLElement>('.pb-panel')!;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('Docs bot');
    expect(panel.classList.contains('pb-open')).toBe(false);

    launcher.click();
    expect(panel.classList.contains('pb-open')).toBe(true);
    expect(launcher.getAttribute('aria-expanded')).toBe('true');

    const input = shadow.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(shadow.activeElement).toBe(input);
    expect(shadow.querySelector('.pb-welcome')?.textContent).toContain(
      'Hi, ask me about the docs.',
    );
    expect(shadow.querySelectorAll('.pb-chip')).toHaveLength(2);

    input.value = 'Where do I create an API key?';
    press(input, 'Enter');

    // The visitor's bubble and the answer placeholder appear before the network answers.
    expect(shadow.querySelector('.pb-user')?.textContent).toBe('Where do I create an API key?');
    expect(shadow.querySelector('.pb-item-assistant .pb-msg')?.classList.contains('pb-caret')).toBe(
      true,
    );
    expect(input.value).toBe('');
    expect(shadow.querySelector('.pb-chips')).toBeNull();

    await vi.waitFor(() => {
      expect(shadow.querySelector('.pb-item-assistant .pb-body')?.innerHTML).toBe(
        '<p>API keys are created in <strong>Settings</strong> <sup class="pb-cite" data-cite="1">1</sup>.</p>',
      );
      expect(
        shadow.querySelector('.pb-item-assistant .pb-msg')?.classList.contains('pb-caret'),
      ).toBe(false);
    });

    const source = shadow.querySelector<HTMLAnchorElement>('.pb-sources a')!;
    expect(source.textContent).toBe('Authentication');
    expect(source.href).toBe('https://docs.example.com/auth');
    expect(source.target).toBe('_blank');

    const chatCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === `${API}/api/widget/chat`,
    )!;
    const body = JSON.parse(String(chatCall[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ key: KEY, message: 'Where do I create an API key?' });
    expect(body.visitorId).toMatch(/^v_[0-9a-f]{32}$/);
    expect(window.localStorage.getItem(`parbot:${KEY}:conversation`)).toBe(body.conversationId);

    // The transcript survives a reload.
    expect(JSON.parse(window.localStorage.getItem(`parbot:${KEY}:messages`) ?? '[]')).toHaveLength(
      2,
    );

    expect(shadow.querySelector('.pb-footer a')?.textContent).toBe('Powered by Parbot');
  });

  it('closes on Escape and gives focus back', async () => {
    installFetch();
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();

    const widget = await boot(mountScript());
    const shadow = shadowOf(widget!);

    widget!.open();
    expect(document.activeElement).toBe(widget!.host);

    press(document, 'Escape');
    expect(shadow.querySelector('.pb-panel')?.classList.contains('pb-open')).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('runs as a palette on Cmd+K with a pill launcher, and hides the launcher when asked', async () => {
    installFetch({ mode: 'palette' });
    const widget = await boot(mountScript());
    const shadow = shadowOf(widget!);

    expect(shadow.querySelector('.pb-launcher')?.className).toContain('pb-pill');
    expect(shadow.querySelector('.pb-launcher')?.textContent).toContain('Ask AI');

    press(document, 'k', { metaKey: true });
    expect(shadow.querySelector('.pb-panel')?.classList.contains('pb-open')).toBe(true);
    expect(shadow.querySelector('.pb-panel')?.getAttribute('aria-modal')).toBe('true');
    // The modal has its own close button; the pill does not float beside it.
    expect(shadow.querySelector<HTMLElement>('.pb-launcher')?.style.display).toBe('none');

    press(document, 'k', { ctrlKey: true });
    expect(shadow.querySelector('.pb-panel')?.classList.contains('pb-open')).toBe(false);
    expect(shadow.querySelector<HTMLElement>('.pb-launcher')?.style.display).toBe('');

    resetForTests();
    document.head.innerHTML = '';

    const hidden = await boot(mountScript({ 'data-launcher': 'false', 'data-mode': 'palette' }));
    expect(shadowOf(hidden!).querySelector<HTMLElement>('.pb-launcher')?.style.display).toBe(
      'none',
    );
  });

  it('ignores a data-mode override and setMode outside the modes the plan allows', async () => {
    installFetch({ mode: 'bubble', modes: ['bubble'] });
    const widget = await boot(mountScript({ 'data-mode': 'palette' }));

    expect(widget!.currentMode).toBe('bubble');
    expect(shadowOf(widget!).querySelector('.pb-launcher')?.className).toContain('pb-round');

    widget!.setMode('palette');
    expect(widget!.currentMode).toBe('bubble');

    resetForTests();
    document.head.innerHTML = '';

    // A config without the list (an older server) still honours the override.
    installFetch({ mode: 'bubble', modes: undefined });
    const open = await boot(mountScript({ 'data-mode': 'palette' }));
    expect(open!.currentMode).toBe('palette');
  });

  it('hides the pill while the palette is open and hands focus back to it on close', async () => {
    installFetch({ mode: 'palette' });
    const widget = await boot(mountScript());
    const shadow = shadowOf(widget!);
    const pill = shadow.querySelector<HTMLButtonElement>('.pb-launcher')!;

    pill.focus();
    pill.click();
    expect(widget!.opened).toBe(true);
    expect(pill.style.display).toBe('none');

    press(document, 'Escape');
    expect(widget!.opened).toBe(false);
    expect(pill.style.display).toBe('');
    expect(pill.textContent).toContain('Ask AI');
    expect(shadow.activeElement).toBe(pill);

    // Switching an open bubble to the palette hides the launcher too, and back shows the close icon.
    resetForTests();
    document.head.innerHTML = '';
    installFetch({ mode: 'bubble' });
    const bubble = await boot(mountScript());
    const launcher = shadowOf(bubble!).querySelector<HTMLButtonElement>('.pb-launcher')!;

    bubble!.open();
    expect(launcher.style.display).toBe('');
    bubble!.setMode('palette');
    expect(launcher.style.display).toBe('none');
    bubble!.setMode('bubble');
    expect(launcher.style.display).toBe('');
    expect(launcher.className).toContain('pb-round');
    bubble!.close();
    expect(launcher.className).toContain('pb-round');
  });

  it('gives focus to the launcher when the panel was opened from it', async () => {
    installFetch();
    const widget = await boot(mountScript());
    const shadow = shadowOf(widget!);
    const launcher = shadow.querySelector<HTMLButtonElement>('.pb-launcher')!;

    launcher.focus();
    launcher.click();
    press(document, 'Escape');

    expect(shadow.activeElement).toBe(launcher);
  });

  it('shows a lead form after an unanswered question when lead capture is on', async () => {
    const fetchMock = installFetch({ leadCapture: true }, false);
    const widget = await boot(mountScript());
    const shadow = shadowOf(widget!);

    widget!.ask('Something the docs do not cover');

    await vi.waitFor(() => {
      expect(shadow.querySelector('form.pb-lead')).not.toBeNull();
    });

    const form = shadow.querySelector<HTMLFormElement>('form.pb-lead')!;
    (form.elements.namedItem('email') as HTMLInputElement).value = 'ada@example.com';
    (form.elements.namedItem('note') as HTMLTextAreaElement).value = 'Please write back';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(shadow.querySelector('.pb-thanks')?.textContent).toBe(
        'Thanks. The team will reply to ada@example.com.',
      );
    });

    const leadCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === `${API}/api/widget/lead`,
    )!;
    expect(JSON.parse(String(leadCall[1]?.body))).toMatchObject({
      key: KEY,
      email: 'ada@example.com',
      note: 'Please write back',
    });
  });

  it('checks the lead email in its own hint instead of a browser bubble', async () => {
    const fetchMock = installFetch({ leadCapture: true }, false);
    const widget = await boot(mountScript());
    const shadow = shadowOf(widget!);

    widget!.ask('Something the docs do not cover');

    await vi.waitFor(() => {
      expect(shadow.querySelector('form.pb-lead')).not.toBeNull();
    });

    const form = shadow.querySelector<HTMLFormElement>('form.pb-lead')!;
    const email = form.elements.namedItem('email') as HTMLInputElement;
    const hint = form.querySelector('.pb-hint')!;
    const send = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

    // With the browser's check on, a click on Send would stop at its bubble and never reach the form.
    expect(form.noValidate).toBe(true);

    send.click();
    expect(hint.textContent).toBe('Enter an email address.');

    email.value = 'not-an-email';
    send.click();
    expect(hint.textContent).toBe('Check the email address and retry.');
    expect(fetchMock.mock.calls.some(([url]) => String(url) === `${API}/api/widget/lead`)).toBe(
      false,
    );
  });

  it('shows an error with retry when the api refuses, and retries', async () => {
    let attempts = 0;
    const mock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url.startsWith(`${API}/api/widget/config`)) {
        return Response.json(config);
      }

      attempts += 1;

      return attempts === 1
        ? Response.json({ error: { code: 'rate_limited', message: 'slow down' } }, { status: 429 })
        : sse(answerEvents('c1'));
    });
    vi.stubGlobal('fetch', mock);

    const widget = await boot(mountScript());
    const shadow = shadowOf(widget!);
    widget!.ask('hello');

    await vi.waitFor(() => {
      expect(shadow.querySelector('.pb-error')?.textContent).toContain('Too many messages');
    });

    shadow.querySelector<HTMLButtonElement>('.pb-error button')!.click();

    await vi.waitFor(() => {
      expect(shadow.querySelector('.pb-item-assistant .pb-body')?.textContent).toContain(
        'API keys are created',
      );
    });
    expect(shadow.querySelectorAll('.pb-user')).toHaveLength(1);
    expect(shadow.querySelector('.pb-error')).toBeNull();
  });

  describe('an answer abandoned mid-stream', () => {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    /** A chat that sends meta and one token, then holds the stream open like a slow model. */
    const installOpenChat = () => {
      const stops: { body: Record<string, unknown>; init: RequestInit }[] = [];
      const mock = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);

        if (url.startsWith(`${API}/api/widget/config`)) {
          return Response.json(config);
        }

        if (url === `${API}/api/widget/stop`) {
          stops.push({ body: JSON.parse(String(init?.body)), init: init! });

          return Response.json({ stopped: true });
        }

        const body = JSON.parse(String(init?.body)) as {
          conversationId: string;
          assistantMessageId: string;
        };

        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              const encoder = new TextEncoder();

              controller.enqueue(
                encoder.encode(
                  encodeSseEvent({
                    type: 'meta',
                    conversationId: body.conversationId,
                    userMessageId: 'u1',
                    assistantMessageId: body.assistantMessageId,
                  }),
                ),
              );
              controller.enqueue(
                encoder.encode(encodeSseEvent({ type: 'token', text: 'API keys are' })),
              );
              init?.signal?.addEventListener('abort', () => {
                controller.error(new DOMException('The operation was aborted.', 'AbortError'));
              });
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );
      });

      vi.stubGlobal('fetch', mock);

      return { mock, stops };
    };

    const chatBody = (mock: FetchMock) =>
      JSON.parse(
        String(mock.mock.calls.find(([url]) => String(url) === `${API}/api/widget/chat`)![1]?.body),
      ) as Record<string, string>;

    it('New conversation tells the server what the visitor had been shown, and frees the composer', async () => {
      const { mock, stops } = installOpenChat();
      const widget = await boot(mountScript());
      const shadow = shadowOf(widget!);

      widget!.ask('Where do I create an API key?');
      await vi.waitFor(() => {
        expect(shadow.querySelector('.pb-item-assistant .pb-body')?.textContent).toBe(
          'API keys are',
        );
      });

      const sent = chatBody(mock);

      expect(sent.assistantMessageId).toMatch(UUID);
      expect(shadow.querySelector<HTMLButtonElement>('.pb-send')!.disabled).toBe(true);

      shadow.querySelector<HTMLButtonElement>('.pb-menu button')!.click();

      expect(stops).toHaveLength(1);
      expect(stops[0]!.body).toEqual({
        key: KEY,
        visitorId: sent.visitorId,
        conversationId: sent.conversationId,
        messageId: sent.assistantMessageId,
        text: 'API keys are',
      });
      // A simple request, so no preflight stands between the stop and a page that is going away.
      expect(stops[0]!.init).toMatchObject({
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        credentials: 'omit',
        keepalive: true,
      });
      expect(shadow.querySelectorAll('.pb-user')).toHaveLength(0);
      expect(shadow.querySelector<HTMLButtonElement>('.pb-send')!.disabled).toBe(false);
    });

    it('a page that takes the widget down mid-answer stops the answer too', async () => {
      const { stops } = installOpenChat();
      const widget = await boot(mountScript());
      const shadow = shadowOf(widget!);

      widget!.ask('Where do I create an API key?');
      await vi.waitFor(() => {
        expect(shadow.querySelector('.pb-item-assistant .pb-body')?.textContent).toBe(
          'API keys are',
        );
      });

      destroy();

      expect(stops).toHaveLength(1);
      expect(stops[0]!.body).toMatchObject({ text: 'API keys are' });
    });

    it('a finished answer has nothing to stop', async () => {
      const mock = installFetch();
      const widget = await boot(mountScript());
      const shadow = shadowOf(widget!);

      widget!.ask('Where do I create an API key?');
      await vi.waitFor(() => {
        expect(shadow.querySelector('.pb-sources')).not.toBeNull();
      });

      shadow.querySelector<HTMLButtonElement>('.pb-menu button')!.click();
      destroy();

      expect(mock.mock.calls.map(([url]) => String(url))).not.toContain(`${API}/api/widget/stop`);
    });
  });

  it('replays api calls made before the widget is ready and starts fresh threads', async () => {
    installFetch();
    ask('Early question');

    const widget = await boot(mountScript());
    const shadow = shadowOf(widget!);

    expect(shadow.querySelector('.pb-user')?.textContent).toBe('Early question');
    expect(widget!.opened).toBe(true);

    await vi.waitFor(() => {
      expect(shadow.querySelector('.pb-sources')).not.toBeNull();
    });

    const before = window.localStorage.getItem(`parbot:${KEY}:conversation`);
    shadow.querySelector<HTMLButtonElement>('.pb-menu button')!.click();

    expect(window.localStorage.getItem(`parbot:${KEY}:conversation`)).not.toBe(before);
    expect(shadow.querySelectorAll('.pb-user')).toHaveLength(0);
    expect(shadow.querySelectorAll('.pb-chip')).toHaveLength(2);
  });

  it('keeps Tab inside the palette and walks the menu with the arrow keys', async () => {
    installFetch({ mode: 'palette' });
    const widget = await boot(mountScript());
    const shadow = shadowOf(widget!);
    const menuButton = shadow.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    const footerLink = shadow.querySelector<HTMLAnchorElement>('.pb-footer a')!;

    widget!.open();

    footerLink.focus();
    press(footerLink, 'Tab');
    expect(shadow.activeElement).toBe(menuButton);

    press(menuButton, 'Tab', { shiftKey: true });
    expect(shadow.activeElement).toBe(footerLink);

    menuButton.click();
    const items = [...shadow.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(items.map((item) => item.textContent)).toEqual(['New conversation', 'Close']);
    expect(shadow.activeElement).toBe(items[0]);

    press(items[0]!, 'ArrowDown');
    expect(shadow.activeElement).toBe(items[1]);
    press(items[1]!, 'ArrowDown');
    expect(shadow.activeElement).toBe(items[0]);
    press(items[0]!, 'End');
    expect(shadow.activeElement).toBe(items[1]);
    press(items[1]!, 'ArrowUp');
    expect(shadow.activeElement).toBe(items[0]);

    // Escape closes the menu first and only then the panel.
    press(items[0]!, 'Escape');
    expect(shadow.querySelector('.pb-menu')?.classList.contains('pb-open')).toBe(false);
    expect(shadow.activeElement).toBe(menuButton);
    expect(widget!.opened).toBe(true);

    press(menuButton, 'Escape');
    expect(widget!.opened).toBe(false);
  });

  it('never shows server or browser text for a failure, only its own sentence', async () => {
    let attempt = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) => {
        if (String(input).startsWith(`${API}/api/widget/config`)) {
          return Response.json(config);
        }

        attempt += 1;

        if (attempt === 1) {
          return sse([
            {
              type: 'error',
              code: 'quota_exceeded',
              message: 'This account has used its 200 answers for the month.',
            },
          ]);
        }

        throw new TypeError('Failed to fetch');
      }),
    );

    const widget = await boot(mountScript());
    const shadow = shadowOf(widget!);

    widget!.ask('hello');
    await vi.waitFor(() => {
      expect(shadow.querySelector('.pb-error')?.textContent).toContain('reached its monthly limit');
    });
    expect(shadow.querySelector('.pb-error')?.textContent).not.toContain('200 answers');

    shadow.querySelector<HTMLButtonElement>('.pb-error button')!.click();
    await vi.waitFor(() => {
      expect(shadow.querySelector('.pb-error')?.textContent).toContain(
        'Could not reach the assistant',
      );
    });
    expect(shadow.querySelector('.pb-error')?.textContent).not.toContain('Failed to fetch');
  });

  /** Answers every question with `text` and these citations, in the order given. */
  const stubAnswer = (text: string, citations: Citation[]) =>
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (String(input).startsWith(`${API}/api/widget/config`)) {
          return Response.json(config);
        }

        const body = JSON.parse(String(init?.body)) as { conversationId: string };

        return sse([
          {
            type: 'meta',
            conversationId: body.conversationId,
            userMessageId: 'u1',
            assistantMessageId: 'a1',
          },
          { type: 'token', text },
          { type: 'citations', citations },
          { type: 'done', answered: true, latencyMs: 1 },
        ]);
      }),
    );

  /** Each source row as its numbers and its title, e.g. "1 2 | HonoRequest - Hono". */
  const sourceRows = (shadow: ShadowRoot) =>
    [...shadow.querySelectorAll('.pb-sources li')].map(
      (row) =>
        `${[...row.querySelectorAll('.pb-source-num')].map((number) => number.textContent).join(' ')} | ${row.querySelector('.pb-source-title')?.textContent}`,
    );

  it('shows a source with an unsafe url as plain text', async () => {
    stubAnswer('See the guide [1] and the page [2].', [
      { index: 1, documentId: 'd1', title: 'Guide', url: 'javascript:alert(1)', snippet: '' },
      {
        index: 2,
        documentId: 'd2',
        title: 'Page',
        url: 'https://docs.example.com/page',
        snippet: '',
      },
    ]);

    const widget = await boot(mountScript());
    const shadow = shadowOf(widget!);
    widget!.ask('hello');

    await vi.waitFor(() => {
      expect(shadow.querySelectorAll('.pb-sources li')).toHaveLength(2);
    });

    const [first, second] = shadow.querySelectorAll('.pb-sources li');
    expect(first?.querySelector('a')).toBeNull();
    expect(first?.querySelector('.pb-source-title')?.textContent).toBe('Guide');
    expect(second?.querySelector('a')?.href).toBe('https://docs.example.com/page');
  });

  it('lists each cited document once with all its numbers, by its first number', async () => {
    const context = (index: number): Citation => ({
      index,
      documentId: 'd-context',
      title: 'Context - Hono',
      url: 'https://hono.dev/docs/api/context',
      snippet: '',
    });

    // The answer mentions [3] first and cites the Context page three times.
    stubAnswer('Use c.req [3], c.json [1] [2] and c.set [4] [5].', [
      context(3),
      {
        index: 1,
        documentId: 'd-request',
        title: 'HonoRequest - Hono',
        url: 'https://hono.dev/docs/api/request',
        snippet: '',
      },
      context(2),
      { index: 4, documentId: 'd-notes', title: 'Team notes', url: null, snippet: '' },
      context(5),
    ]);

    const widget = await boot(mountScript());
    const shadow = shadowOf(widget!);
    widget!.ask('How do I read the request?');

    await vi.waitFor(() => {
      expect(shadow.querySelectorAll('.pb-sources li')).toHaveLength(3);
    });

    expect(sourceRows(shadow)).toEqual([
      '1 | HonoRequest - Hono',
      '2 3 5 | Context - Hono',
      '4 | Team notes',
    ]);

    const [request, contextRow, notes] = shadow.querySelectorAll('.pb-sources li');
    expect(request?.querySelector('a')?.href).toBe('https://hono.dev/docs/api/request');
    expect(contextRow?.querySelectorAll('a')).toHaveLength(1);
    expect(contextRow?.querySelector('a')?.href).toBe('https://hono.dev/docs/api/context');
    expect(contextRow?.querySelector('a')?.target).toBe('_blank');
    expect(notes?.querySelector('a')).toBeNull();

    // The same rows come back after a reload, from the saved transcript.
    resetForTests();
    document.body.innerHTML = '';
    const reloaded = await boot(mountScript());
    const again = shadowOf(reloaded!);

    expect(sourceRows(again)).toEqual([
      '1 | HonoRequest - Hono',
      '2 3 5 | Context - Hono',
      '4 | Team notes',
    ]);
  });

  it('groups a transcript saved before document ids were kept by its links', async () => {
    window.localStorage.setItem(
      `parbot:${KEY}:messages`,
      JSON.stringify([
        { role: 'user', text: 'How?', citations: [] },
        {
          role: 'assistant',
          text: 'Like this [2] [1] [3].',
          answered: true,
          citations: [
            { index: 2, title: 'Context - Hono', url: 'https://hono.dev/docs/api/context' },
            { index: 1, title: 'Context - Hono', url: 'https://hono.dev/docs/api/context' },
            { index: 3, title: 'Pasted', url: null },
          ],
        },
      ]),
    );
    installFetch();

    const widget = await boot(mountScript());

    expect(sourceRows(shadowOf(widget!))).toEqual(['1 2 | Context - Hono', '3 | Pasted']);
  });

  it('opens at once without taking focus, and sends the preview version with the config request', async () => {
    const fetchMock = installFetch();
    const widget = await boot(mountScript({ 'data-version': '4', 'data-open': 'true' }));

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/api/widget/config?key=${KEY}&v=4`,
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(widget!.opened).toBe(true);
    expect(shadowOf(widget!).activeElement).toBeNull();
  });

  it('wears the scheme the host page picks over the saved one, and switches when the page does', async () => {
    // A light accent is darkened on light backgrounds only, so the accent text shows the scheme.
    const accent = '#f5f5f5';
    installFetch({ theme: { ...config.theme, scheme: 'auto', accent } });
    const widget = await boot(mountScript({ 'data-scheme': 'dark' }));
    const root = shadowOf(widget!).querySelector<HTMLElement>('.pb-root')!;

    expect(root.dataset.scheme).toBe('dark');
    expect(root.style.getPropertyValue('--pb-accent-text')).toBe(accentText(accent, 'dark'));

    setScheme('light');
    expect(root.dataset.scheme).toBe('light');
    expect(root.style.getPropertyValue('--pb-accent-text')).toBe(accentText(accent, 'light'));

    setScheme('sepia' as WidgetScheme);
    expect(root.dataset.scheme).toBe('light');
  });

  it('follows the OS in auto, keeps a scheme the page set, and stops listening when destroyed', async () => {
    const accent = '#f5f5f5';
    const listeners = new Set<() => void>();
    let osDark = false;
    vi.stubGlobal('matchMedia', (media: string) => ({
      media,
      get matches() {
        return osDark;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }));
    const flipOs = (dark: boolean) => {
      osDark = dark;
      listeners.forEach((listener) => listener());
    };

    installFetch({ theme: { ...config.theme, scheme: 'auto', accent } });
    const widget = await boot(mountScript());
    const root = shadowOf(widget!).querySelector<HTMLElement>('.pb-root')!;

    expect(root.dataset.scheme).toBe('auto');
    expect(root.style.getPropertyValue('--pb-accent-text')).toBe(accentText(accent, 'light'));

    flipOs(true);
    expect(root.style.getPropertyValue('--pb-accent-text')).toBe(accentText(accent, 'dark'));

    setScheme('light');
    flipOs(true);
    expect(root.style.getPropertyValue('--pb-accent-text')).toBe(accentText(accent, 'light'));
    expect(listeners.size).toBe(1);

    resetForTests();
    expect(listeners.size).toBe(0);
  });

  it('leaves the page for good when destroyed, even while it is still starting', async () => {
    installFetch({ mode: 'palette' });
    const widget = await boot(mountScript());

    destroy();
    expect(document.getElementById('parbot-widget')).toBeNull();

    // Its shortcut goes with it: Cmd+K belongs to the page again.
    const shortcut = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(shortcut);
    expect(shortcut.defaultPrevented).toBe(false);
    expect(widget!.opened).toBe(false);

    resetForTests();
    document.head.innerHTML = '';

    // Destroyed before the config arrived: it never mounts, and later calls are dropped.
    const starting = boot(mountScript());
    destroy();
    ask('Anyone there?');

    expect(await starting).toBeNull();
    expect(document.getElementById('parbot-widget')).toBeNull();
  });

  describe('⌘K pressed while the config loads', () => {
    /** A config request that answers only when the test says so. */
    const holdConfig = (overrides: Partial<WidgetConfig>) => {
      let answer: () => void = () => {};

      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(
          () =>
            new Promise<Response>((resolve) => {
              answer = () => resolve(Response.json({ ...config, ...overrides }));
            }),
        ),
      );

      return () => answer();
    };

    const shortcut = () => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });

      document.dispatchEvent(event);

      return event;
    };

    it('opens the palette once it mounts, and keeps the browser from taking the keys', async () => {
      const answer = holdConfig({ mode: 'palette' });
      const starting = boot(mountScript());

      expect(shortcut().defaultPrevented).toBe(true);
      answer();

      const widget = await starting;

      expect(widget!.opened).toBe(true);
      expect(shadowOf(widget!).activeElement).toBe(shadowOf(widget!).querySelector('textarea'));

      // From here the widget's own listener handles the shortcut, once per press.
      shortcut();
      expect(widget!.opened).toBe(false);
    });

    it('toggles like the shortcut does: two presses leave the palette closed', async () => {
      const answer = holdConfig({ mode: 'palette' });
      const starting = boot(mountScript());

      shortcut();
      shortcut();
      answer();

      expect((await starting)!.opened).toBe(false);
    });

    it('drops the press when the widget turns out to be a bubble', async () => {
      const answer = holdConfig({ mode: 'bubble' });
      const starting = boot(mountScript());

      shortcut();
      answer();

      expect((await starting)!.opened).toBe(false);
    });

    it('leaves the keys to the page when the script pins the bubble, or the widget is gone', async () => {
      const answer = holdConfig({ mode: 'palette' });
      const starting = boot(mountScript({ 'data-mode': 'bubble' }));

      expect(shortcut().defaultPrevented).toBe(false);
      answer();
      expect((await starting)!.opened).toBe(false);

      resetForTests();
      document.head.innerHTML = '';

      const again = holdConfig({ mode: 'palette' });
      const destroyedWhileStarting = boot(mountScript());

      destroy();
      expect(shortcut().defaultPrevented).toBe(false);
      again();
      expect(await destroyedWhileStarting).toBeNull();
    });
  });

  it('does nothing without a key and warns when the config cannot load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );

    expect(await boot(null)).toBeNull();

    const script = document.createElement('script');
    script.setAttribute('data-parbot', 'pb_missing');
    expect(await boot(script)).toBeNull();
    expect(document.getElementById('parbot-widget')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
