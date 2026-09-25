import {
  type ChatErrorCode,
  MAX_MESSAGE_LENGTH,
  readChatStream,
  type WidgetChatRequest,
  type WidgetConfig,
  type WidgetLeadRequest,
  type WidgetMode,
} from '@parbot/shared';

import { accentText, onAccent } from './config';
import { renderMarkdown, safeUrl } from './markdown';
import {
  getConversationId,
  getVisitorId,
  loadMessages,
  resetConversation,
  saveMessages,
  type StoredMessage,
} from './storage';
import { STYLES } from './styles';

export type WidgetOptions = {
  key: string;
  api: string;
  config: WidgetConfig;
  mode?: WidgetMode | null;
  launcher?: boolean;
};

type Message = StoredMessage & {
  id: string;
  streaming?: boolean;
  /** `network` is the widget's own code for a request that never reached the server. */
  error?: { code: ChatErrorCode | 'network' } | null;
  lead?: 'form' | 'sent' | null;
  leadEmail?: string;
};

const ICONS = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  spark:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>',
};

/**
 * What a visitor reads for each failure. Server text never shows unchanged: it can name the
 * owner's plan or a library, neither of which is the visitor's business.
 */
const ERROR_COPY: Record<ChatErrorCode, string> = {
  rate_limited: 'Too many messages in a short time. Wait a moment and retry.',
  origin_not_allowed: 'This site is not allowed to use the assistant.',
  not_found: 'The assistant could not be found.',
  bad_request: 'That message could not be sent. Shorten it and retry.',
  unauthorized: 'This assistant is not available here.',
  quota_exceeded: 'This assistant has reached its monthly limit. Try again later.',
  model_busy: 'The assistant is busy right now. Wait a moment and retry.',
  internal: 'The answer could not be loaded. Retry in a moment.',
};

const NETWORK_ERROR = 'Could not reach the assistant. Check your connection and retry.';

const errorCopy = (code: ChatErrorCode | 'network') =>
  code === 'network' ? NETWORK_ERROR : ERROR_COPY[code];

const LEAD_FAILED = 'The message could not be sent. Try again.';

/** Lead form failures that deserve their own sentence; every other code reads as LEAD_FAILED. */
const LEAD_ERROR_COPY: Partial<Record<ChatErrorCode, string>> = {
  rate_limited: 'Too many attempts in a short time. Wait a moment and retry.',
  unauthorized: 'This assistant does not take email addresses.',
  bad_request: 'Check the email address and retry.',
};

const isErrorCode = (value: unknown): value is ChatErrorCode =>
  typeof value === 'string' && value in ERROR_COPY;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const isMac = () =>
  /Mac|iPhone|iPad/.test(
    typeof navigator === 'undefined' ? '' : navigator.platform || navigator.userAgent,
  );

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (html !== undefined) {
    node.innerHTML = html;
  }

  return node;
};

let counter = 0;
const nextId = () => `m${Date.now().toString(36)}${(counter += 1)}`;

const toStored = (message: Message): StoredMessage => ({
  role: message.role,
  text: message.text,
  citations: message.citations,
  answered: message.answered,
});

const prefersDark = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * One mounted widget: a launcher and a panel inside a shadow root, holding the conversation
 * for the page. Everything the visitor sees is rendered by hand; no framework is involved.
 */
export class ParbotWidget {
  readonly host: HTMLElement;
  readonly shadow: ShadowRoot;

  private readonly key: string;
  private readonly api: string;
  private readonly config: WidgetConfig;
  private readonly showLauncher: boolean;
  private mode: WidgetMode;
  private isOpen = false;
  private messages: Message[] = [];
  private visitorId: string;
  private conversationId: string;
  private controller: AbortController | null = null;
  private lastFocus: Element | null = null;

  private readonly root: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly launcher: HTMLButtonElement;
  private readonly menu: HTMLElement;
  private readonly menuButton: HTMLButtonElement;
  private readonly list: HTMLElement;
  private readonly composer: HTMLFormElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly items = new Map<string, HTMLElement>();

  constructor(options: WidgetOptions) {
    this.key = options.key;
    this.api = options.api;
    this.config = options.config;
    this.mode = options.mode && this.allows(options.mode) ? options.mode : options.config.mode;
    this.showLauncher = options.launcher !== false;
    this.visitorId = getVisitorId(this.key);
    this.conversationId = getConversationId(this.key);
    this.messages = loadMessages(this.key).map((stored) => ({ ...stored, id: nextId() }));

    this.host = el('div');
    this.host.id = 'parbot-widget';
    this.shadow = this.host.attachShadow({ mode: 'open' });

    const style = el('style');
    style.textContent = STYLES;
    this.shadow.append(style);

    this.root = el('div', 'pb-root');
    this.overlay = el('div', 'pb-overlay');
    this.panel = el('div', 'pb-panel');
    this.launcher = el('button', 'pb-launcher');
    this.menu = el('div', 'pb-menu');
    this.menuButton = el('button', 'pb-icon-btn', ICONS.more);
    this.list = el('div', 'pb-messages');
    this.composer = el('form', 'pb-composer');
    this.input = el('textarea');
    this.sendButton = el('button', 'pb-send', ICONS.send);

    this.build();
  }

  mount(target: HTMLElement = document.body) {
    target.append(this.host);
    this.applyTheme();
    this.renderAll();
    document.addEventListener('keydown', this.onDocumentKeydown);

    return this;
  }

  destroy() {
    this.controller?.abort();
    document.removeEventListener('keydown', this.onDocumentKeydown);
    this.host.remove();
  }

  /** Opens the panel. Focus moves to the composer unless the caller asks it not to. */
  open(options: { focus?: boolean } = {}) {
    if (this.isOpen) {
      return;
    }

    this.isOpen = true;
    this.lastFocus = document.activeElement;
    this.overlay.classList.add('pb-open');
    this.panel.classList.add('pb-open');
    this.launcher.setAttribute('aria-expanded', 'true');
    this.launcher.setAttribute('aria-label', `Close ${this.config.name}`);
    this.renderLauncher();

    if (options.focus !== false) {
      this.input.focus();
    }

    this.scrollToBottom(true);
  }

  close() {
    if (!this.isOpen) {
      return;
    }

    this.isOpen = false;
    this.closeMenu();
    this.overlay.classList.remove('pb-open');
    this.panel.classList.remove('pb-open');
    this.launcher.setAttribute('aria-expanded', 'false');
    this.launcher.setAttribute('aria-label', `Open ${this.config.name}`);
    this.renderLauncher();

    // Opening from the launcher leaves the host as the active element, which cannot take focus
    // back; the launcher is the visible control the visitor came from.
    if (this.lastFocus instanceof HTMLElement && this.lastFocus !== this.host) {
      this.lastFocus.focus();
    } else if (this.showLauncher) {
      this.launcher.focus();
    }

    this.lastFocus = null;
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  setMode(mode: WidgetMode) {
    if (!this.allows(mode)) {
      return;
    }

    this.mode = mode;
    this.root.dataset.mode = mode;
    this.panel.setAttribute('aria-modal', mode === 'palette' ? 'true' : 'false');
    this.renderLauncher();
  }

  /** The plan decides which modes exist; an older config without the list allows both. */
  private allows(mode: WidgetMode) {
    return !this.config.modes || this.config.modes.includes(mode);
  }

  ask(question: string) {
    this.open();
    void this.send(question);
  }

  get opened() {
    return this.isOpen;
  }

  get currentMode() {
    return this.mode;
  }

  private build() {
    const { name } = this.config;

    this.root.dataset.mode = this.mode;

    // Header
    const header = el('div', 'pb-header');
    const dot = el('span', 'pb-dot');
    const title = el('span', 'pb-title');
    title.textContent = name;
    title.id = 'pb-title';
    this.menuButton.setAttribute('aria-label', 'Menu');
    this.menuButton.setAttribute('aria-haspopup', 'menu');
    this.menuButton.setAttribute('aria-expanded', 'false');
    this.menuButton.type = 'button';
    this.menuButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleMenu();
    });

    this.menu.setAttribute('role', 'menu');
    this.menu.setAttribute('aria-label', 'Conversation');
    const fresh = el('button', undefined, 'New conversation');
    fresh.type = 'button';
    fresh.setAttribute('role', 'menuitem');
    fresh.addEventListener('click', () => {
      this.closeMenu();
      this.newConversation();
    });
    const closeItem = el('button', undefined, 'Close');
    closeItem.type = 'button';
    closeItem.setAttribute('role', 'menuitem');
    closeItem.addEventListener('click', () => this.close());
    this.menu.append(fresh, closeItem);
    this.menu.addEventListener('keydown', (event) => this.onMenuKeydown(event));

    const closeButton = el('button', 'pb-icon-btn', ICONS.close);
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.addEventListener('click', () => this.close());

    header.append(dot, title, this.menuButton, closeButton, this.menu);

    // Composer
    this.composer.setAttribute('aria-label', 'Ask a question');
    const search = el('span', 'pb-search', ICONS.search);
    this.input.rows = 1;
    this.input.placeholder = 'Ask a question';
    this.input.setAttribute('aria-label', 'Your question');
    this.input.maxLength = MAX_MESSAGE_LENGTH;
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.submit();
      }
    });
    this.input.addEventListener('input', () => this.autosize());
    this.sendButton.type = 'submit';
    this.sendButton.setAttribute('aria-label', 'Send');
    this.composer.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submit();
    });
    this.composer.append(search, this.input, this.sendButton);

    // Messages
    this.list.setAttribute('role', 'log');
    this.list.setAttribute('aria-live', 'polite');
    this.list.setAttribute('aria-relevant', 'additions text');

    // Footer
    const footer = el('div', `pb-footer${this.config.hideBranding ? ' pb-hidden' : ''}`);
    const link = el('a');
    link.href = `${this.api}/`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Powered by Parbot';
    footer.append(link);

    // Panel
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', name);
    this.panel.setAttribute('aria-modal', this.mode === 'palette' ? 'true' : 'false');
    this.panel.append(header, this.list, this.composer, footer);
    this.panel.addEventListener('click', () => this.closeMenu());
    this.panel.addEventListener('keydown', (event) => this.onPanelKeydown(event));

    this.overlay.addEventListener('click', () => this.close());

    this.launcher.type = 'button';
    this.launcher.setAttribute('aria-expanded', 'false');
    this.launcher.setAttribute('aria-label', `Open ${name}`);
    this.launcher.addEventListener('click', () => this.toggle());

    this.root.append(this.overlay, this.panel, this.launcher);
    this.shadow.append(this.root);
    this.renderLauncher();
  }

  private applyTheme() {
    const { theme } = this.config;
    const scheme = theme.scheme === 'auto' ? (prefersDark() ? 'dark' : 'light') : theme.scheme;

    this.root.dataset.scheme = theme.scheme;
    this.root.dataset.radius = theme.radius;
    this.root.dataset.position = theme.position;
    this.root.style.setProperty('--pb-accent', theme.accent);
    this.root.style.setProperty('--pb-on-accent', onAccent(theme.accent));
    this.root.style.setProperty('--pb-accent-text', accentText(theme.accent, scheme));

    if (theme.scheme === 'auto' && typeof window.matchMedia === 'function') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
        this.root.style.setProperty(
          '--pb-accent-text',
          accentText(theme.accent, event.matches ? 'dark' : 'light'),
        );
      });
    }
  }

  private renderLauncher() {
    // The open palette is a modal with its own close button; the pill left floating beside it
    // would be a second control competing with that button and with Send.
    if (!this.showLauncher || (this.mode === 'palette' && this.isOpen)) {
      this.launcher.style.display = 'none';

      return;
    }

    this.launcher.style.display = '';

    if (this.mode === 'palette') {
      this.launcher.className = 'pb-launcher pb-pill';
      this.launcher.innerHTML = `${ICONS.spark}<span>Ask AI</span><kbd>${isMac() ? '⌘K' : 'Ctrl K'}</kbd>`;
    } else {
      this.launcher.className = 'pb-launcher pb-round';
      this.launcher.innerHTML = this.isOpen ? ICONS.close : ICONS.chat;
    }
  }

  private readonly onDocumentKeydown = (event: KeyboardEvent) => {
    if (
      this.mode === 'palette' &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 'k'
    ) {
      event.preventDefault();
      this.toggle();

      return;
    }

    if (event.key === 'Escape' && this.isOpen) {
      if (this.menu.classList.contains('pb-open')) {
        this.closeMenu();
        this.menuButton.focus();
      } else {
        this.close();
      }
    }
  };

  /**
   * The palette is modal (it sits on an overlay), so Tab must not leave it for the page behind.
   * The bubble panel is not modal and keeps the page's natural tab order.
   */
  private readonly onPanelKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || this.mode !== 'palette' || !this.isOpen) {
      return;
    }

    // The closed menu and a hidden footer are the only parts of the panel that are not shown.
    const focusable = [...this.panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (node) => !node.closest('.pb-menu:not(.pb-open), .pb-hidden'),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (!first || !last) {
      return;
    }

    const active = this.shadow.activeElement;

    if (event.shiftKey && (active === first || !this.panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !this.panel.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  private menuItems() {
    return [...this.menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  }

  /** Arrow keys walk the menu, Home and End jump, Tab leaves it and closes it. */
  private readonly onMenuKeydown = (event: KeyboardEvent) => {
    const items = this.menuItems();
    const index = items.findIndex((item) => item === this.shadow.activeElement);
    let next: number | null = null;

    if (event.key === 'ArrowDown') {
      next = (index + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      next = (index - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = items.length - 1;
    } else if (event.key === 'Tab') {
      this.closeMenu();

      return;
    }

    if (next !== null) {
      event.preventDefault();
      items[next]?.focus();
    }
  };

  private toggleMenu() {
    const open = !this.menu.classList.contains('pb-open');
    this.menu.classList.toggle('pb-open', open);
    this.menuButton.setAttribute('aria-expanded', String(open));

    if (open) {
      this.menuItems()[0]?.focus();
    }
  }

  private closeMenu() {
    this.menu.classList.remove('pb-open');
    this.menuButton.setAttribute('aria-expanded', 'false');
  }

  private newConversation() {
    this.controller?.abort();
    this.controller = null;
    this.conversationId = resetConversation(this.key);
    this.messages = [];
    this.renderAll();
    this.input.focus();
  }

  private autosize() {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(this.input.scrollHeight, 120)}px`;
  }

  private submit() {
    const question = this.input.value;

    if (!question.trim() || this.controller) {
      return;
    }

    this.input.value = '';
    this.autosize();
    void this.send(question);
  }

  /** Sends one question and streams the answer into a placeholder beneath the visitor's bubble. */
  async send(question: string) {
    const text = question.trim().slice(0, MAX_MESSAGE_LENGTH);

    if (!text || this.controller) {
      return;
    }

    const user: Message = { id: nextId(), role: 'user', text, citations: [] };
    const answer: Message = {
      id: nextId(),
      role: 'assistant',
      text: '',
      citations: [],
      streaming: true,
    };
    this.messages.push(user, answer);
    this.renderItem(user);
    this.renderItem(answer);
    this.renderChips();
    this.scrollToBottom(true);
    this.setBusy(true);

    const controller = new AbortController();
    this.controller = controller;

    const body: WidgetChatRequest = {
      key: this.key,
      visitorId: this.visitorId,
      conversationId: this.conversationId,
      message: text,
      pageUrl: window.location.href,
    };

    try {
      const response = await fetch(`${this.api}/api/widget/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'omit',
        signal: controller.signal,
      });

      if (!response.headers.get('content-type')?.includes('text/event-stream')) {
        answer.error = { code: await this.readErrorCode(response) };
      } else {
        for await (const event of readChatStream(response)) {
          if (event.type === 'token') {
            answer.text += event.text;
            this.renderItem(answer);
            this.scrollToBottom(false);
          } else if (event.type === 'citations') {
            answer.citations = event.citations.map(({ index, title, url }) => ({
              index,
              title,
              url,
            }));
          } else if (event.type === 'done') {
            answer.answered = event.answered;

            if (!event.answered && this.config.leadCapture) {
              answer.lead = 'form';
            }
          } else if (event.type === 'error') {
            answer.error = { code: isErrorCode(event.code) ? event.code : 'internal' };
          }
        }

        if (!answer.error && answer.answered === undefined && !answer.text) {
          answer.error = { code: 'internal' };
        }
      }
    } catch {
      // A blocked request, a dropped connection or a stream cut short. The browser's own text
      // ("Failed to fetch") is not copy, so all of them read as one sentence.
      if (!controller.signal.aborted) {
        answer.error = { code: 'network' };
      }
    } finally {
      if (this.controller === controller) {
        this.controller = null;
        this.setBusy(false);
      }
    }

    if (controller.signal.aborted) {
      return;
    }

    answer.streaming = false;
    this.renderItem(answer);
    this.scrollToBottom(false);
    this.persist();
  }

  /** The code of a refused request. A body that cannot be read counts as internal, or rate limited by status. */
  private async readErrorCode(response: Response): Promise<ChatErrorCode> {
    try {
      const data = (await response.json()) as { error?: { code?: unknown } };

      if (isErrorCode(data.error?.code)) {
        return data.error.code;
      }
    } catch {
      // Not JSON; fall through to the status.
    }

    return response.status === 429 ? 'rate_limited' : 'internal';
  }

  private retry(answerId: string) {
    const index = this.messages.findIndex((message) => message.id === answerId);

    if (index < 1) {
      return;
    }

    const [user] = this.messages.splice(index - 1, 2);
    this.items.get(answerId)?.remove();
    this.items.delete(answerId);

    if (user) {
      this.items.get(user.id)?.remove();
      this.items.delete(user.id);
      void this.send(user.text);
    }
  }

  private async submitLead(answer: Message, form: HTMLFormElement) {
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    const note = (form.elements.namedItem('note') as HTMLTextAreaElement).value.trim();
    const status = form.querySelector('.pb-hint') as HTMLElement;
    const button = form.querySelector('.pb-btn:not(.pb-ghost)') as HTMLButtonElement;

    if (!email) {
      status.textContent = 'Enter an email address.';

      return;
    }

    button.disabled = true;
    status.textContent = 'Sending';

    const body: WidgetLeadRequest = {
      key: this.key,
      visitorId: this.visitorId,
      conversationId: this.conversationId,
      email,
      note: note || undefined,
      pageUrl: window.location.href,
    };

    try {
      const response = await fetch(`${this.api}/api/widget/lead`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'omit',
      });

      if (!response.ok) {
        status.textContent = LEAD_ERROR_COPY[await this.readErrorCode(response)] ?? LEAD_FAILED;
        button.disabled = false;

        return;
      }

      answer.lead = 'sent';
      answer.leadEmail = email;
      this.renderItem(answer);
    } catch {
      status.textContent = 'The message could not be sent. Check your connection and retry.';
      button.disabled = false;
    }
  }

  private setBusy(busy: boolean) {
    this.sendButton.disabled = busy;
  }

  private persist() {
    saveMessages(this.key, this.messages.filter((message) => !message.error).map(toStored));
  }

  private renderAll() {
    this.list.innerHTML = '';
    this.items.clear();

    const welcome = el('div', 'pb-item pb-welcome');
    const bubble = el('div', 'pb-msg pb-assistant');
    const body = el('div', 'pb-body');
    body.innerHTML = renderMarkdown(
      this.config.welcomeMessage || `Ask me anything about ${this.config.name}.`,
    );
    bubble.append(body);
    welcome.append(bubble);
    this.list.append(welcome);

    this.renderChips();

    for (const message of this.messages) {
      this.renderItem(message);
    }

    this.scrollToBottom(true);
  }

  private renderChips() {
    const existing = this.list.querySelector('.pb-chips');
    const show = this.messages.length === 0 && this.config.suggestedQuestions.length > 0;

    if (!show) {
      existing?.remove();

      return;
    }

    if (existing) {
      return;
    }

    const chips = el('div', 'pb-chips');
    chips.setAttribute('aria-label', 'Suggested questions');

    for (const question of this.config.suggestedQuestions) {
      const chip = el('button', 'pb-chip');
      chip.type = 'button';
      chip.textContent = question;
      chip.addEventListener('click', () => void this.send(question));
      chips.append(chip);
    }

    this.list.querySelector('.pb-welcome')?.after(chips);
  }

  /** Creates or refreshes the DOM for one message in place. */
  private renderItem(message: Message) {
    let item = this.items.get(message.id);

    if (!item) {
      item = el('div', `pb-item pb-item-${message.role}`);
      item.dataset.id = message.id;
      this.items.set(message.id, item);
      this.list.append(item);
    }

    if (message.role === 'user') {
      if (!item.firstChild) {
        const bubble = el('div', 'pb-msg pb-user');
        bubble.textContent = message.text;
        item.append(bubble);
      }

      return;
    }

    let bubble = item.querySelector<HTMLElement>('.pb-msg');

    if (!bubble) {
      bubble = el('div', 'pb-msg pb-assistant');
      bubble.append(el('div', 'pb-body'));
      item.append(bubble);
    }

    const body = bubble.querySelector<HTMLElement>('.pb-body');

    if (body) {
      body.innerHTML = renderMarkdown(message.text);
    }

    bubble.classList.toggle('pb-caret', Boolean(message.streaming));
    bubble.style.display = message.text || message.streaming ? '' : 'none';

    bubble.querySelector('.pb-sources')?.remove();

    if (!message.streaming && message.citations.length > 0) {
      bubble.append(this.renderSources(message));
    }

    item.querySelector('.pb-error')?.remove();
    item.querySelector('.pb-lead')?.remove();
    item.querySelector('.pb-thanks')?.remove();

    if (message.streaming) {
      return;
    }

    if (message.error) {
      const line = el('div', 'pb-error');
      line.setAttribute('role', 'alert');
      const text = el('span');
      text.textContent = errorCopy(message.error.code);
      const retry = el('button', undefined, 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', () => this.retry(message.id));
      line.append(text, retry);
      item.append(line);
    } else if (message.lead === 'form') {
      item.append(this.renderLeadForm(message));
    } else if (message.lead === 'sent') {
      const thanks = el('div', 'pb-thanks');
      thanks.textContent = `Thanks. The team will reply to ${message.leadEmail ?? 'you'}.`;
      item.append(thanks);
    }
  }

  private renderSources(message: Message) {
    const sources = el('div', 'pb-sources');
    sources.append(el('div', 'pb-sources-title', 'Sources'));
    const list = el('ol');

    for (const citation of message.citations) {
      const entry = el('li');
      entry.value = citation.index;

      const href = citation.url ? safeUrl(citation.url) : null;

      if (href) {
        const link = el('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = citation.title;
        entry.append(link);
      } else {
        entry.textContent = citation.title;
      }

      list.append(entry);
    }

    sources.append(list);

    return sources;
  }

  private renderLeadForm(message: Message) {
    const form = el('form', 'pb-lead');
    form.setAttribute('aria-label', 'Leave your email');
    form.innerHTML = `
      <p>Leave your email and the team will follow up with an answer.</p>
      <input name="email" type="email" autocomplete="email" placeholder="you@company.com" aria-label="Email" required>
      <textarea name="note" rows="2" placeholder="Anything else we should know (optional)" aria-label="Message"></textarea>
      <div class="pb-row"><span class="pb-hint" aria-live="polite"></span><button type="button" class="pb-btn pb-ghost">No thanks</button><button type="submit" class="pb-btn">Send</button></div>`;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submitLead(message, form);
    });
    (form.querySelector('.pb-ghost') as HTMLButtonElement).addEventListener('click', () => {
      message.lead = null;
      this.renderItem(message);
    });

    return form;
  }

  private scrollToBottom(force: boolean) {
    const distance = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight;

    if (force || distance < 120) {
      this.list.scrollTop = this.list.scrollHeight;
    }
  }
}
