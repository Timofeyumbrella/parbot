import {
  type ChatErrorCode,
  DEFAULT_WIDGET_THEME,
  HEX_COLOR_PATTERN,
  isWidgetMode,
  MAX_ALLOWED_ORIGINS,
  MAX_LEAD_NOTE_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_PAGE_URL_LENGTH,
  MAX_SUGGESTED_QUESTION_LENGTH,
  MAX_SUGGESTED_QUESTIONS,
  MAX_WELCOME_MESSAGE_LENGTH,
  normalizeWidgetTheme,
  PUBLIC_KEY_PATTERN,
  UUID_PATTERN,
  VISITOR_ID_PATTERN,
  WIDGET_MODES,
  WIDGET_POSITIONS,
  WIDGET_RADII,
  WIDGET_SCHEMES,
  type WidgetConfig,
  type WidgetTheme,
} from '@parbot/shared';
import { z } from 'zod';

import type { Assistant } from '@/lib/db';
import type { ServiceClient } from '@/lib/engine';
import { publicEnv } from '@/lib/env';
import { type Plan, type PlanLimits, planFor } from '@/lib/plans';

/**
 * Pieces shared by the anonymous widget routes (config, chat, lead), the demo page and the
 * widget settings action: key lookup, origin matching, CORS, error bodies and plan gating.
 */

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

const key = z.string().regex(PUBLIC_KEY_PATTERN, 'Malformed public key.');
const visitorId = z.string().regex(VISITOR_ID_PATTERN, 'Malformed visitor id.');
const conversationId = z.string().regex(UUID_PATTERN, 'Malformed conversation id.');
const pageUrl = z.string().max(MAX_PAGE_URL_LENGTH).optional();

export const widgetChatSchema = z.object({
  key,
  visitorId,
  conversationId,
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  pageUrl,
});

export const widgetLeadSchema = z.object({
  key,
  visitorId,
  conversationId: conversationId.optional(),
  email: z.email().max(254),
  note: z.string().trim().max(MAX_LEAD_NOTE_LENGTH).optional(),
  pageUrl,
});

/** Parses a JSON body without throwing; malformed JSON becomes null and fails validation. */
export const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

/** One readable sentence for a failed validation, naming the field when there is one. */
export const firstIssue = (error: z.ZodError, fallback = 'Check the request and try again.') => {
  const issue = error.issues[0];

  if (!issue) {
    return fallback;
  }

  const path = issue.path.map(String).join('.');

  return path ? `${path}: ${issue.message}` : issue.message;
};

// ---------------------------------------------------------------------------
// Origins
// ---------------------------------------------------------------------------

const parseOrigin = (value: string) => {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

const HOSTNAME = /^(?:\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/i;

/** True for the forms an owner may list: `https://docs.acme.com`, `docs.acme.com`, `*.acme.com`. */
export const isValidOriginEntry = (entry: string) => {
  const value = entry.trim();

  if (!value) {
    return false;
  }

  if (value.includes('://')) {
    const url = parseOrigin(value);

    return Boolean(url && (url.pathname === '/' || url.pathname === '') && !url.search && !url.hash);
  }

  return HOSTNAME.test(value);
};

const matchesEntry = (origin: URL, entry: string) => {
  const value = entry.trim().toLowerCase();

  if (!value) {
    return false;
  }

  if (value.startsWith('*.')) {
    const suffix = value.slice(2);

    return origin.hostname === suffix || origin.hostname.endsWith(`.${suffix}`);
  }

  if (value.includes('://')) {
    const allowed = parseOrigin(value);

    return Boolean(allowed && allowed.origin === origin.origin);
  }

  // A bare hostname, optionally with a port, on any scheme.
  return value.includes(':') ? origin.host === value : origin.hostname === value;
};

/**
 * Whether a request origin may use an assistant. An empty list allows any site; hostnames
 * compare case-insensitively; `*.example.com` covers the apex and every subdomain.
 */
export const isOriginAllowed = (origin: string | null, allowed: string[]) => {
  const entries = allowed.map((entry) => entry.trim()).filter(Boolean);

  if (entries.length === 0) {
    return true;
  }

  if (!origin) {
    return false;
  }

  const parsed = parseOrigin(origin);

  return Boolean(parsed && entries.some((entry) => matchesEntry(parsed, entry)));
};

export const appOrigin = () => parseOrigin(publicEnv.appUrl)?.origin ?? null;

/**
 * The origin a browser request came from. Same-origin GETs carry no Origin header, so the
 * Referer stands in; a request with neither is treated as having no origin at all.
 */
export const requestOrigin = (request: Request): string | null => {
  const origin = request.headers.get('origin');

  if (origin && origin !== 'null') {
    return parseOrigin(origin)?.origin ?? null;
  }

  const referer = request.headers.get('referer');

  return referer ? (parseOrigin(referer)?.origin ?? null) : null;
};

/** The assistant's own list, plus the app itself so the demo page and the live preview work. */
export const originAllowed = (origin: string | null, allowed: string[]) =>
  isOriginAllowed(origin, allowed) || (origin !== null && origin === appOrigin());

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const corsHeaders = (origin?: string | null): Record<string, string> => ({
  'access-control-allow-origin': origin ?? '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
  vary: 'Origin',
});

export const preflight = (request: Request) =>
  new Response(null, { status: 204, headers: corsHeaders(requestOrigin(request)) });

export const jsonError = (
  status: number,
  code: ChatErrorCode,
  message: string,
  headers?: Record<string, string>,
) => Response.json({ error: { code, message } }, { status, headers: { ...corsHeaders(), ...headers } });

/** The first address in x-forwarded-for is the client; the rest are proxies. */
export const clientIp = (request: Request) => {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
};

export const WIDGET_VISITOR_LIMIT = { limit: 12, windowMs: 60_000 };
export const WIDGET_IP_LIMIT = { limit: 60, windowMs: 60_000 };
export const WIDGET_LEAD_LIMIT = { limit: 5, windowMs: 60_000 };

// ---------------------------------------------------------------------------
// Assistants
// ---------------------------------------------------------------------------

export type WidgetAssistant = Pick<
  Assistant,
  | 'id'
  | 'owner_id'
  | 'name'
  | 'instructions'
  | 'welcome_message'
  | 'suggested_questions'
  | 'mode'
  | 'theme'
  | 'allowed_origins'
  | 'hide_branding'
  | 'lead_capture'
>;

export const WIDGET_ASSISTANT_COLUMNS =
  'id, owner_id, name, instructions, welcome_message, suggested_questions, mode, theme, allowed_origins, hide_branding, lead_capture';

export const findAssistantByKey = async (
  service: ServiceClient,
  publicKey: string,
): Promise<WidgetAssistant | null> => {
  if (!PUBLIC_KEY_PATTERN.test(publicKey)) {
    return null;
  }

  const { data } = await service
    .from('assistants')
    .select(WIDGET_ASSISTANT_COLUMNS)
    .eq('public_key', publicKey)
    .maybeSingle();

  return data ?? null;
};

/** The owner's plan as the answer engine sees it: a cancelled subscription behaves like Hobby. */
export const loadOwnerPlan = async (service: ServiceClient, ownerId: string): Promise<Plan> => {
  const { data } = await service
    .from('subscriptions')
    .select('plan_id, status')
    .eq('account_id', ownerId)
    .maybeSingle();

  return planFor(data?.status === 'canceled' ? 'hobby' : data?.plan_id);
};

/** What the widget may show, with every gated setting folded back to its free-plan value. */
export const widgetConfigFor = (assistant: WidgetAssistant, plan: PlanLimits): WidgetConfig => ({
  assistantId: assistant.id,
  name: assistant.name,
  welcomeMessage: assistant.welcome_message,
  suggestedQuestions: assistant.suggested_questions.slice(0, MAX_SUGGESTED_QUESTIONS),
  mode: plan.palette && isWidgetMode(assistant.mode) ? assistant.mode : 'bubble',
  theme: plan.customTheme ? normalizeWidgetTheme(assistant.theme) : { ...DEFAULT_WIDGET_THEME },
  hideBranding: plan.hideBranding && assistant.hide_branding,
  leadCapture: plan.leadCapture && assistant.lead_capture,
  modes: plan.palette ? ['bubble', 'palette'] : ['bubble'],
});

// ---------------------------------------------------------------------------
// Settings form
// ---------------------------------------------------------------------------

export type WidgetSettings = {
  mode: (typeof WIDGET_MODES)[number];
  theme: WidgetTheme;
  welcomeMessage: string;
  suggestedQuestions: string[];
  allowedOrigins: string[];
  hideBranding: boolean;
  leadCapture: boolean;
};

const lines = (value: unknown) =>
  typeof value === 'string'
    ? value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

const checkbox = z.preprocess((value) => value === 'on' || value === 'true' || value === true, z.boolean());

export const widgetSettingsSchema = z.object({
  mode: z.enum(WIDGET_MODES),
  scheme: z.enum(WIDGET_SCHEMES).default(DEFAULT_WIDGET_THEME.scheme),
  accent: z
    .string()
    .regex(HEX_COLOR_PATTERN, 'The accent must be a six digit hex colour.')
    .default(DEFAULT_WIDGET_THEME.accent),
  position: z.enum(WIDGET_POSITIONS).default(DEFAULT_WIDGET_THEME.position),
  radius: z.enum(WIDGET_RADII).default(DEFAULT_WIDGET_THEME.radius),
  welcomeMessage: z
    .string()
    .trim()
    .min(1, 'Write a welcome message.')
    .max(MAX_WELCOME_MESSAGE_LENGTH, `Keep the welcome message under ${MAX_WELCOME_MESSAGE_LENGTH} characters.`),
  suggestedQuestions: z.preprocess(
    lines,
    z
      .array(z.string().max(MAX_SUGGESTED_QUESTION_LENGTH, `Keep each question under ${MAX_SUGGESTED_QUESTION_LENGTH} characters.`))
      .max(MAX_SUGGESTED_QUESTIONS, `List at most ${MAX_SUGGESTED_QUESTIONS} suggested questions.`),
  ),
  allowedOrigins: z.preprocess(
    lines,
    z
      .array(
        z.string().refine(isValidOriginEntry, {
          message: 'Origins look like https://docs.example.com, docs.example.com or *.example.com.',
        }),
      )
      .max(MAX_ALLOWED_ORIGINS, `List at most ${MAX_ALLOWED_ORIGINS} origins.`),
  ),
  hideBranding: checkbox.default(false),
  leadCapture: checkbox.default(false),
});

export type ParsedWidgetSettings =
  | { success: true; data: WidgetSettings }
  | { success: false; error: string };

export const parseWidgetSettings = (formData: FormData): ParsedWidgetSettings => {
  const raw: Record<string, unknown> = {};

  for (const name of ['mode', 'scheme', 'accent', 'position', 'radius', 'welcomeMessage', 'suggestedQuestions', 'allowedOrigins', 'hideBranding', 'leadCapture']) {
    const value = formData.get(name);

    if (value !== null) {
      raw[name] = value;
    }
  }

  const result = widgetSettingsSchema.safeParse(raw);

  if (!result.success) {
    const issue = result.error.issues[0];

    return { success: false, error: issue?.message ?? 'Check the form and try again.' };
  }

  const { mode, scheme, accent, position, radius, ...rest } = result.data;

  return {
    success: true,
    data: { mode, theme: { scheme, accent: accent.toLowerCase(), position, radius }, ...rest },
  };
};

const sameTheme = (a: WidgetTheme, b: WidgetTheme) =>
  a.scheme === b.scheme && a.accent.toLowerCase() === b.accent.toLowerCase() && a.position === b.position && a.radius === b.radius;

/** The first plan rule the settings break, or null when the plan allows all of them. */
export const gateWidgetSettings = (settings: WidgetSettings, plan: PlanLimits): string | null => {
  if (settings.mode === 'palette' && !plan.palette) {
    return 'The palette mode is available on Starter and up.';
  }

  if (!plan.customTheme && !sameTheme(settings.theme, DEFAULT_WIDGET_THEME)) {
    return 'A custom theme is available on Starter and up.';
  }

  if (settings.hideBranding && !plan.hideBranding) {
    return 'Hiding the Parbot branding is available on Starter and up.';
  }

  if (settings.leadCapture && !plan.leadCapture) {
    return 'Lead capture is available on Starter and up.';
  }

  return null;
};

/** The settings form's initial values, read from the assistant row. */
export const widgetSettingsOf = (assistant: WidgetAssistant): WidgetSettings => ({
  mode: isWidgetMode(assistant.mode) ? assistant.mode : 'bubble',
  theme: normalizeWidgetTheme(assistant.theme),
  welcomeMessage: assistant.welcome_message,
  suggestedQuestions: assistant.suggested_questions,
  allowedOrigins: assistant.allowed_origins,
  hideBranding: assistant.hide_branding,
  leadCapture: assistant.lead_capture,
});

/** The script tag a customer pastes into their site. */
export const installSnippet = (publicKey: string, appUrl = publicEnv.appUrl) =>
  `<script async src="${appUrl.replace(/\/+$/, '')}/widget.js" data-parbot="${publicKey}"></script>`;
