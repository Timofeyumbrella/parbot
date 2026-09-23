'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type Endpoint = '/api/billing/checkout' | '/api/billing/portal';

/**
 * Posts to a billing endpoint and follows the URL it returns. Same-origin destinations (the mock
 * provider) go through the router so the screen changes in the same frame; Stripe is a full load.
 */
export const useBillingRedirect = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A same-origin push keeps this component mounted, so the URL change is what ends the wait.
  useEffect(() => {
    setPending(false);
  }, [searchParams]);

  const go = useCallback(
    async (endpoint: Endpoint, body?: Record<string, string>) => {
      setPending(true);
      setError(null);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body ?? {}),
        });
        const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

        if (!response.ok || !payload?.url) {
          setError(payload?.error ?? 'Something went wrong. Try again in a moment.');
          setPending(false);

          return;
        }

        const target = new URL(payload.url, window.location.href);

        if (target.origin === window.location.origin) {
          router.push(`${target.pathname}${target.search}`);
        } else {
          window.location.assign(target.toString());
        }
      } catch {
        setError('The request did not reach the server. Check your connection and try again.');
        setPending(false);
      }
    },
    [router],
  );

  return { go, pending, error };
};
