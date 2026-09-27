// Types and helpers shared by the Next.js app and the embeddable widget.
// Keep this package dependency free: the widget bundles it into a single script.

export type PlanId = 'hobby' | 'starter' | 'growth';

/** A passage the answer was drawn from. `index` matches the [n] markers in the answer text. */
export type Citation = {
  index: number;
  documentId: string;
  title: string;
  url: string | null;
  snippet: string;
  /**
   * The passage itself, so the app can open the document at it. Answers saved before it existed
   * have none, and the widget never receives it.
   */
  chunkId?: string;
};

export type ChatErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'not_found'
  | 'origin_not_allowed'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'model_busy'
  | 'internal';

/** Server-sent events emitted by POST /api/chat and POST /api/widget/chat, in order. */
export type ChatStreamEvent =
  | { type: 'meta'; conversationId: string; userMessageId: string; assistantMessageId: string }
  | { type: 'token'; text: string }
  | { type: 'citations'; citations: Citation[] }
  /**
   * What the engine is doing before the first token, for the thinking state: "Reading guide.pdf…"
   * while a referenced file finishes indexing. Only the in-app chat sends it; clients that do not
   * know it ignore it.
   */
  | { type: 'status'; message: string }
  | { type: 'done'; answered: boolean; latencyMs: number }
  | { type: 'error'; code: ChatErrorCode; message: string };

export type WidgetScheme = 'auto' | 'light' | 'dark';
export type WidgetPosition = 'left' | 'right';
export type WidgetRadius = 'sm' | 'md' | 'lg';
export type WidgetMode = 'bubble' | 'palette';

export type WidgetTheme = {
  scheme: WidgetScheme;
  accent: string;
  position: WidgetPosition;
  radius: WidgetRadius;
};

export const DEFAULT_WIDGET_THEME: WidgetTheme = {
  scheme: 'auto',
  accent: '#f59e0b',
  position: 'right',
  radius: 'md',
};

/** What GET /api/widget/config returns for a public key. Nothing in here is secret. */
export type WidgetConfig = {
  assistantId: string;
  name: string;
  welcomeMessage: string;
  suggestedQuestions: string[];
  mode: WidgetMode;
  theme: WidgetTheme;
  hideBranding: boolean;
  leadCapture: boolean;
  /** The modes the owner's plan allows; a data-mode override outside this list is ignored. */
  modes?: WidgetMode[];
};

export type WidgetChatRequest = {
  key: string;
  visitorId: string;
  conversationId: string;
  message: string;
  pageUrl?: string;
  /** The id the answer will be saved under, chosen by the client so it can stop the answer at any moment. */
  assistantMessageId?: string;
};

/** POST /api/widget/stop: the visitor abandoned an answer; `text` is what they had been shown. */
export type WidgetStopRequest = {
  key: string;
  visitorId: string;
  conversationId: string;
  messageId: string;
  text: string;
};

export type WidgetLeadRequest = {
  key: string;
  visitorId: string;
  conversationId?: string;
  email: string;
  note?: string;
  pageUrl?: string;
};

export type AppChatRequest = {
  assistantId: string;
  conversationId: string;
  message: string;
  /** The id the answer will be saved under, chosen by the client so it can stop the answer at any moment. */
  assistantMessageId?: string;
  /**
   * Ids of the assistant's sources the reader pointed at (@ or an attached file). A list, even an
   * empty one, becomes the conversation's references; left out, the conversation keeps the ones it
   * has, so a follow-up still reads the file the first question named.
   */
  references?: string[];
};

/** The most sources one question can reference. */
export const MAX_REFERENCES = 10;

/** POST /api/messages/[messageId]/stop: the reader pressed Stop; `text` is what they had been shown. */
export type AppStopRequest = {
  assistantId: string;
  conversationId: string;
  text: string;
};

/**
 * The longest shown text a stop request carries. Answers are capped far below this; a longer
 * text is cut by the client, and a cut text is still a prefix of the answer.
 */
export const MAX_STOP_TEXT_LENGTH = 20_000;

export const MAX_MESSAGE_LENGTH = 2000;
export const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * A random version 4 UUID. `crypto.randomUUID` exists only in secure contexts, and the widget also
 * runs on plain http pages, so this falls back to `getRandomValues`, which works everywhere.
 */
export const randomUuid = (): string => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));

  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const isWidgetTheme = (value: unknown): value is WidgetTheme => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const theme = value as Record<string, unknown>;

  return (
    (theme.scheme === 'auto' || theme.scheme === 'light' || theme.scheme === 'dark') &&
    typeof theme.accent === 'string' &&
    HEX_COLOR_PATTERN.test(theme.accent) &&
    (theme.position === 'left' || theme.position === 'right') &&
    (theme.radius === 'sm' || theme.radius === 'md' || theme.radius === 'lg')
  );
};

export const normalizeWidgetTheme = (value: unknown): WidgetTheme =>
  isWidgetTheme(value) ? value : { ...DEFAULT_WIDGET_THEME };

export const encodeSseEvent = (event: ChatStreamEvent) => `data: ${JSON.stringify(event)}\n\n`;

/**
 * Reads a chat response body as a stream of events. Frames are `data: <json>` lines separated
 * by blank lines; anything else (comments, keep-alives) is ignored.
 */
export async function* readChatStream(response: Response): AsyncGenerator<ChatStreamEvent> {
  if (!response.body) {
    yield { type: 'error', code: 'internal', message: 'The response had no body.' };

    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');

      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const event = parseFrame(frame);

        if (event) {
          yield event;
        }

        boundary = buffer.indexOf('\n\n');
      }
    }

    const tail = parseFrame(buffer);

    if (tail) {
      yield tail;
    }
  } finally {
    reader.releaseLock();
  }
}

const parseFrame = (frame: string): ChatStreamEvent | null => {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');

  if (!data) {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as ChatStreamEvent;

    return typeof parsed === 'object' && parsed && 'type' in parsed ? parsed : null;
  } catch {
    return null;
  }
};

/** Pulls the [n] citation markers out of an answer, in order of first appearance. */
export const citedIndexes = (answer: string, available: number) => {
  const found = [...answer.matchAll(/\[(\d{1,2})(?:\s*,\s*(\d{1,2}))*\]/g)].flatMap((match) =>
    match[0]
      .slice(1, -1)
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((index) => index >= 1 && index <= available)
      .map((index) => index),
  );

  return [...new Set(found)];
};

// ---------------------------------------------------------------------------
// Widget settings: the value sets and limits the settings form, the widget API
// and the widget script agree on.
// ---------------------------------------------------------------------------

export const WIDGET_MODES = ['bubble', 'palette'] as const;
export const WIDGET_SCHEMES = ['auto', 'light', 'dark'] as const;
export const WIDGET_POSITIONS = ['left', 'right'] as const;
export const WIDGET_RADII = ['sm', 'md', 'lg'] as const;

export const MAX_SUGGESTED_QUESTIONS = 4;
export const MAX_SUGGESTED_QUESTION_LENGTH = 120;
export const MAX_WELCOME_MESSAGE_LENGTH = 300;
export const MAX_ALLOWED_ORIGINS = 20;
export const MAX_LEAD_NOTE_LENGTH = 1000;
export const MAX_PAGE_URL_LENGTH = 2048;

/**
 * A visitor-supplied address that is safe to link to: an http(s) URL, trimmed, or null for
 * anything else (javascript:, data:, relative paths, garbage). The widget API keeps only what
 * passes, and the inbox runs stored page URLs through it again before rendering them as hrefs.
 */
export const safeHttpUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  try {
    const { protocol } = new URL(trimmed);

    return protocol === 'http:' || protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
};

/** Keys default to `pb_<32 hex>` in the database; the pattern is deliberately looser. */
export const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export const isWidgetMode = (value: unknown): value is WidgetMode =>
  value === 'bubble' || value === 'palette';

/** Accent swatches offered in the widget settings; the first is the default. */
export const WIDGET_ACCENT_PRESETS = [
  '#f59e0b',
  '#2563eb',
  '#16a34a',
  '#db2777',
  '#7c3aed',
  '#0f172a',
] as const;

/**
 * The JSON body of a failed widget API call. Streaming errors use ChatStreamEvent instead. The
 * message is repeated at the top level so a client that only reads `{ message }` still gets it.
 */
export type WidgetApiError = {
  error: { code: ChatErrorCode; message: string };
  message: string;
};
