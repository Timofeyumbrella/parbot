import { NextResponse } from 'next/server';
import { z } from 'zod';

import { BillingError, billingReturnUrl, createBillingProvider } from '@/lib/billing';
import { getSession } from '@/lib/session';

const bodySchema = z.object({
  planId: z.enum(['hobby', 'starter', 'growth']),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
});

/** Starts a checkout for a paid plan and returns where to send the visitor. */
export async function POST(request: Request) {
  const { user } = await getSession();

  if (!user) {
    return NextResponse.json({ error: 'Sign in to choose a plan.' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Send a planId of starter or growth and an interval of monthly or yearly.' },
      { status: 400 },
    );
  }

  const { planId, interval } = parsed.data;

  if (planId === 'hobby') {
    return NextResponse.json(
      {
        error:
          'Hobby is free and needs no checkout. To move down to Hobby, manage your subscription.',
      },
      { status: 400 },
    );
  }

  try {
    const { url } = await createBillingProvider().createCheckout({
      accountId: user.id,
      email: user.email ?? '',
      planId,
      interval,
      returnUrl: billingReturnUrl(request),
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error('Checkout could not be started', error);

    return NextResponse.json(
      {
        error:
          error instanceof BillingError
            ? error.message
            : 'Checkout could not be started. Try again in a moment.',
      },
      { status: 502 },
    );
  }
}
