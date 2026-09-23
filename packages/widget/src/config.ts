import {
  DEFAULT_WIDGET_THEME,
  HEX_COLOR_PATTERN,
  isWidgetMode,
  normalizeWidgetTheme,
  type WidgetConfig,
  type WidgetMode,
} from '@parbot/shared';

export type ScriptOptions = {
  key: string;
  api: string;
  mode: WidgetMode | null;
  launcher: boolean;
};

/** Reads the embedding <script> tag. Returns null when there is no key to work with. */
export const readScriptOptions = (script: HTMLScriptElement | null): ScriptOptions | null => {
  const key = script?.getAttribute('data-parbot')?.trim();

  if (!key) {
    return null;
  }

  const mode = script?.getAttribute('data-mode')?.trim().toLowerCase();
  const api = script?.getAttribute('data-api')?.trim().replace(/\/+$/, '');

  return {
    key,
    api: api || originOf(script?.src) || window.location.origin,
    mode: isWidgetMode(mode) ? mode : null,
    launcher: script?.getAttribute('data-launcher')?.trim().toLowerCase() !== 'false',
  };
};

const originOf = (src: string | undefined) => {
  if (!src) {
    return null;
  }

  try {
    return new URL(src, window.location.href).origin;
  } catch {
    return null;
  }
};

/** The script element that loaded the widget, whether it was written in the page or injected. */
export const findScript = (): HTMLScriptElement | null => {
  const current = document.currentScript;

  if (current instanceof HTMLScriptElement && current.hasAttribute('data-parbot')) {
    return current;
  }

  return document.querySelector<HTMLScriptElement>('script[data-parbot]');
};

const asString = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);

/** Accepts only what the config endpoint documents; anything odd falls back to a safe default. */
export const normalizeConfig = (value: unknown): WidgetConfig | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;

  if (typeof raw.assistantId !== 'string' || typeof raw.name !== 'string') {
    return null;
  }

  return {
    assistantId: raw.assistantId,
    name: raw.name,
    welcomeMessage: asString(raw.welcomeMessage, ''),
    suggestedQuestions: Array.isArray(raw.suggestedQuestions)
      ? raw.suggestedQuestions.filter((item): item is string => typeof item === 'string' && item.trim() !== '').slice(0, 4)
      : [],
    mode: isWidgetMode(raw.mode) ? raw.mode : 'bubble',
    theme: normalizeWidgetTheme(raw.theme),
    hideBranding: raw.hideBranding === true,
    leadCapture: raw.leadCapture === true,
  };
};

export const fetchConfig = async (api: string, key: string): Promise<WidgetConfig | null> => {
  const response = await fetch(`${api}/api/widget/config?key=${encodeURIComponent(key)}`, {
    method: 'GET',
    credentials: 'omit',
  });

  if (!response.ok) {
    throw new Error(`The widget config could not be loaded (${response.status}).`);
  }

  return normalizeConfig(await response.json());
};

const channel = (hex: string, offset: number) => {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;

  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance of a #rrggbb colour, 0 (black) to 1 (white). */
export const luminance = (color: string) => {
  const hex = HEX_COLOR_PATTERN.test(color) ? color : DEFAULT_WIDGET_THEME.accent;

  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
};

/** Text colour that stays readable on the accent. */
export const onAccent = (accent: string) => (luminance(accent) > 0.35 ? '#111114' : '#ffffff');

const mix = (color: string, target: string, amount: number) => {
  const parse = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const [r1, g1, b1] = parse(color);
  const [r2, g2, b2] = parse(target);
  const blend = (a = 0, b = 0) => Math.round(a + (b - a) * amount).toString(16).padStart(2, '0');

  return `#${blend(r1, r2)}${blend(g1, g2)}${blend(b1, b2)}`;
};

/**
 * The accent used for links and citation markers inside answers. Very light accents are
 * darkened for light backgrounds and very dark ones lightened for dark backgrounds.
 */
export const accentText = (accent: string, scheme: 'light' | 'dark') => {
  const hex = HEX_COLOR_PATTERN.test(accent) ? accent : DEFAULT_WIDGET_THEME.accent;
  const light = luminance(hex);

  if (scheme === 'light' && light > 0.35) {
    return mix(hex, '#000000', 0.45);
  }

  if (scheme === 'dark' && light < 0.15) {
    return mix(hex, '#ffffff', 0.55);
  }

  return hex;
};
