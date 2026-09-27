import { isWidgetMode, WIDGET_MODES, type WidgetConfig, type WidgetMode } from '@parbot/shared';

export type DemoMode = {
  /** The modes the owner's plan allows, so the page only offers switches that will work. */
  allowed: readonly WidgetMode[];
  /** A `?mode=` override the plan allows, passed to the script as `data-mode`. */
  override: WidgetMode | null;
  /** What the widget will actually run as. */
  active: WidgetMode;
};

export type DemoPreview = {
  /** Open the panel as soon as the widget mounts, so the preview shows the conversation, not a launcher. */
  open: boolean;
};

/**
 * Reads the flag the settings preview adds to the demo address. The `?v=` it also adds is not
 * read: the page always hands the widget the version of the row it has just loaded, which is
 * never older than the one in an address someone kept open or bookmarked.
 */
export const resolveDemoPreview = (query: { open?: unknown }): DemoPreview => ({
  open: query.open === '1' || query.open === 'true',
});

/** Resolves the `?mode=` query against what the assistant's plan allows. */
export const resolveDemoMode = (
  requested: unknown,
  config: Pick<WidgetConfig, 'mode' | 'modes'>,
): DemoMode => {
  const allowed = config.modes ?? WIDGET_MODES;
  const override = isWidgetMode(requested) && allowed.includes(requested) ? requested : null;

  return { allowed, override, active: override ?? config.mode };
};

const TRAILING_DOCS = /(?:^|\s+)(?:docs|documentation)$/i;

export type DemoNames = {
  /** What the docs are about: the assistant's name without a trailing "docs". */
  product: string;
  /** The stand-in site's brand, which says "docs" exactly once. */
  site: string;
};

/**
 * Names for the stand-in docs site. Assistants are often already called "Acme Docs", and
 * appending " docs" to that reads like a typo on the very page the preview shows.
 */
export const demoNames = (name: string): DemoNames => {
  const trimmed = name.trim();

  if (!TRAILING_DOCS.test(trimmed)) {
    return { product: trimmed, site: `${trimmed} docs` };
  }

  return { product: trimmed.replace(TRAILING_DOCS, '') || trimmed, site: trimmed };
};
