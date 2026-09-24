import { publicEnv } from '@/lib/env';

const isLocalOrigin = (origin: string) => {
  try {
    const { hostname } = new URL(origin);

    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

/**
 * The origin Stripe or the mock provider sends the visitor back to. The configured app URL is
 * the source of truth; the request's own origin is honoured only when it is that URL or a local
 * dev server, so a dev server on another port still lands back on itself.
 */
export const trustedOrigin = (request: Request, appUrl = publicEnv.appUrl) => {
  const configured = new URL(appUrl).origin;
  const candidate = request.headers.get('origin');

  if (candidate && (candidate === configured || isLocalOrigin(candidate))) {
    return candidate;
  }

  return configured;
};

export const billingReturnUrl = (request: Request, appUrl = publicEnv.appUrl) =>
  `${trustedOrigin(request, appUrl)}/billing`;
