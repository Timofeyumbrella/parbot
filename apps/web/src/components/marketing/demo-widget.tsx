'use client';

import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';

type Scheme = 'light' | 'dark';

/** The part of window.Parbot the landing uses. */
type WidgetApi = { setScheme?: (scheme: Scheme) => void; destroy?: () => void };

type LoadedWidget = { script: HTMLScriptElement; api?: WidgetApi };

/**
 * Where the hero goes to two columns (Tailwind's lg). Narrower, the demo panel sits under the copy
 * and the widget's fixed pill would cover its questions and composer, so the pill stays off and
 * the panel is the demo; ⌘K still opens the palette.
 */
export const WIDE_HERO_QUERY = '(min-width: 64rem)';

/**
 * Loads the widget script as a ⌘K palette in the page's own scheme. The site defaults to dark
 * whatever the OS prefers, so the widget's "auto" would open a white palette over a dark page.
 */
export const DemoWidget = ({ demoKey }: { demoKey: string }) => {
  const { resolvedTheme } = useTheme();
  const scheme: Scheme = resolvedTheme === 'light' ? 'light' : 'dark';
  const loaded = useRef<LoadedWidget | null>(null);

  useEffect(() => {
    const script = document.createElement('script');
    const widget: LoadedWidget = { script };
    let left = false;

    // Fired straight after the script runs, so window.Parbot is still this copy's API.
    script.addEventListener(
      'load',
      () => {
        widget.api = (window as Window & { Parbot?: WidgetApi }).Parbot;

        if (left) {
          widget.api?.destroy?.();
        }
      },
      { once: true },
    );

    script.src = '/widget.js';
    script.async = true;
    script.dataset.parbot = demoKey;
    script.dataset.mode = 'palette';
    script.dataset.launcher = String(window.matchMedia(WIDE_HERO_QUERY).matches);
    document.body.append(script);
    loaded.current = widget;

    return () => {
      // The demo belongs to this page. Left running, it followed the visitor into sign-up and the
      // app, where ⌘K is the chat search. A copy still loading is stopped as soon as it runs.
      left = true;
      widget.api?.destroy?.();
      script.remove();
      loaded.current = null;
    };
  }, [demoKey]);

  useEffect(() => {
    const widget = loaded.current;

    // The script reads the attribute when it runs; after that the widget takes the call.
    if (widget) {
      widget.script.dataset.scheme = scheme;
      widget.api?.setScheme?.(scheme);
    }
  }, [demoKey, scheme]);

  return null;
};
