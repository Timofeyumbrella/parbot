import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import {
  createSubscriptionStore,
  getStripe,
  handleStripeEvent,
  retrieveSubscription,
} from '@/lib/billing';
import { serverEnv } from '@/lib/env';

/**
 * Stripe posts subscription lifecycle events here. The body is read raw because the signature
 * covers the exact bytes. Anything that fails verification is a 400; an event we cannot apply
 * because of our own failure is a 500 so Stripe retries it.
 *
 * Every refusal after the signature header reads the same to the caller, whatever the reason: a
 * missing secret or key would otherwise tell anyone who posts here that billing is not set up.
 * The reason goes to the server log instead.
 */
const invalidSignature = () =>
  NextResponse.json({ error: 'Invalid Stripe signature.' }, { status: 400 });

export async function POST(request: Request) {
  const secret = serverEnv().stripeWebhookSecret;
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature.' }, { status: 400 });
  }

  if (!secret) {
    console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET is not configured; event refused');

    return invalidSignature();
  }

  let stripe: Stripe;

  try {
    stripe = getStripe();
  } catch (error) {
    console.error(
      '[stripe webhook] Stripe is not configured; event refused',
      error instanceof Error ? error.message : error,
    );

    return invalidSignature();
  }

  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, secret);
  } catch (error) {
    console.warn(
      '[stripe webhook] signature check failed',
      error instanceof Error ? error.message : error,
    );

    return invalidSignature();
  }

  try {
    const outcome = await handleStripeEvent(event, {
      store: createSubscriptionStore(),
      retrieveSubscription,
      log: (message) => console.warn(`[stripe webhook ${event.id}] ${message}`),
    });

    return NextResponse.json({ received: true, handled: outcome.handled });
  } catch (error) {
    console.error(`[stripe webhook ${event.id}] ${event.type} failed`, error);

    return NextResponse.json({ error: 'The event could not be applied.' }, { status: 500 });
  }
}
