import { isWidgetMode, WIDGET_MODES, type WidgetConfig, type WidgetMode } from '@parbot/shared';

export type DemoMode = {
  /** The modes the owner's plan allows, so the page only offers switches that will work. */
  allowed: readonly WidgetMode[];
  /** A `?mode=` override the plan allows, passed to the script as `data-mode`. */
  override: WidgetMode | null;
  /** What the widget will actually run as. */
  active: WidgetMode;
};

/** Resolves the `?mode=` query against what the assistant's plan allows. */
export const resolveDemoMode = (requested: unknown, config: Pick<WidgetConfig, 'mode' | 'modes'>): DemoMode => {
  const allowed = config.modes ?? WIDGET_MODES;
  const override = isWidgetMode(requested) && allowed.includes(requested) ? requested : null;

  return { allowed, override, active: override ?? config.mode };
};
