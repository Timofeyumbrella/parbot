'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';

type Endpoint = '/api/billing/checkout' | '/api/billing/portal';

/**
 * Posts to a billing endpoint and follows the URL it returns. Same-origin destinations (the mock
 * provider) go through the router inside a transition, so the button stays busy until the new
 * screen is on. Stripe is a full page load, so the button stays busy until the page unloads.
 */
export const useBillingRedirect = () => {
  const router = useRouter();
  const [requesting, setRequesting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [navigating, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const go = useCallback(
    async (endpoint: Endpoint, body?: Record<string, string>) => {
      setRequesting(true);
      setError(null);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body ?? {}),
        });
        const payload = (await response.json().catch(() => null)) as {
          url?: string;
          error?: string;
        } | null;

        if (!response.ok || !payload?.url) {
          setError(payload?.error ?? 'Something went wrong. Try again in a moment.');

          return;
        }

        const target = new URL(payload.url, window.location.href);

        if (target.origin === window.location.origin) {
          startTransition(() => {
            router.push(`${target.pathname}${target.search}`);
          });
        } else {
          setLeaving(true);
          window.location.assign(target.toString());
        }
      } catch {
        setError('The request did not reach the server. Check your connection and try again.');
      } finally {
        setRequesting(false);
      }
    },
    [router],
  );

  return { go, pending: requesting || navigating || leaving, error };
};
