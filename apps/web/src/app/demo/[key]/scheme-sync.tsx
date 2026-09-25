'use client';

import { useTheme } from 'next-themes';
import { useEffect } from 'react';

type Scheme = 'light' | 'dark';
type WidgetWindow = Window & { Parbot?: { setScheme?: (scheme: Scheme) => void } };

const RETRY_MS = 100;
const GIVE_UP_MS = 5_000;

/**
 * The demo page stands in for a customer's docs site and wears the app's colour scheme. A widget
 * saved on Auto would follow the operating system instead, so light and dark could clash in the
 * settings preview. When the owner left the scheme on Auto, keep the widget on the page's scheme.
 */
export const SchemeSync = ({ enabled }: { enabled: boolean }) => {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!enabled || (resolvedTheme !== 'light' && resolvedTheme !== 'dark')) {
      return;
    }

    const scheme: Scheme = resolvedTheme;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    // The widget script loads after hydration, so its API may not exist yet.
    const apply = () => {
      const api = (window as WidgetWindow).Parbot;

      if (api?.setScheme) {
        api.setScheme(scheme);

        return;
      }

      if (Date.now() - startedAt < GIVE_UP_MS) {
        timer = setTimeout(apply, RETRY_MS);
      }
    };

    apply();

    return () => clearTimeout(timer);
  }, [enabled, resolvedTheme]);

  return null;
};
