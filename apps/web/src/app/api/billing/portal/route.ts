import { NextResponse } from 'next/server';

import { BillingError, billingReturnUrl, createBillingProvider } from '@/lib/billing';
import { getSession } from '@/lib/session';

/** Opens the customer portal (or its mock stand-in) and returns where to send the visitor. */
export async function POST(request: Request) {
  const { user } = await getSession();

  if (!user) {
    return NextResponse.json({ error: 'Sign in to manage your subscription.' }, { status: 401 });
  }

  try {
    const { url } = await createBillingProvider().createPortal({
      accountId: user.id,
      returnUrl: billingReturnUrl(request),
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error('Portal could not be opened', error);

    return NextResponse.json(
      { error: error instanceof BillingError ? error.message : 'The portal could not be opened. Try again in a moment.' },
      { status: error instanceof BillingError ? 409 : 502 },
    );
  }
}
