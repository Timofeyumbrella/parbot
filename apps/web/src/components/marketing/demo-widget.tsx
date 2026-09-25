'use client';

import { useTheme } from 'next-themes';
import { useEffect } from 'react';

type Scheme = 'light' | 'dark';

type WidgetApi = { setScheme?: (scheme: Scheme) => void };

/**
 * Loads the widget script as a ⌘K palette in the page's own scheme. The site defaults to dark
 * whatever the OS prefers, so the widget's "auto" would open a white palette over a dark page.
 */
export const DemoWidget = ({ demoKey }: { demoKey: string }) => {
  const { resolvedTheme } = useTheme();
  const scheme: Scheme = resolvedTheme === 'light' ? 'light' : 'dark';

  useEffect(() => {
    const loaded = document.querySelector<HTMLScriptElement>('script[data-parbot]');

    if (loaded) {
      // The script reads the attribute when it runs; once it has, the widget takes the call.
      loaded.dataset.scheme = scheme;
      (window as Window & { Parbot?: WidgetApi }).Parbot?.setScheme?.(scheme);

      return;
    }

    const script = document.createElement('script');

    script.src = '/widget.js';
    script.async = true;
    script.dataset.parbot = demoKey;
    script.dataset.mode = 'palette';
    script.dataset.scheme = scheme;
    document.body.append(script);
  }, [demoKey, scheme]);

  return null;
};
