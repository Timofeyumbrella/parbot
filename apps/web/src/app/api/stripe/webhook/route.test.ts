import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryStore, PERIOD_END, subscriptionFixture } from '@/lib/billing/testing';

// The fixture's subscription metadata names this account, as our Checkout sessions do.
const ACCOUNT = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-00000000ef01';
const SECRET = 'whsec_test_secret';

let memory = createMemoryStore([ACCOUNT, OTHER]);
const retrieveSubscription = vi.fn();

vi.mock('@/lib/billing/store', () => ({
  createSubscriptionStore: () => memory.store,
}));

vi.mock('@/lib/billing/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/billing/stripe')>()),
  retrieveSubscription: (id: string) => retrieveSubscription(id),
}));

vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET);
vi.stubEnv('STRIPE_PRICE_STARTER_MONTHLY', 'price_sm');
vi.stubEnv('STRIPE_PRICE_STARTER_YEARLY', 'price_sy');
vi.stubEnv('STRIPE_PRICE_GROWTH_MONTHLY', 'price_gm');
vi.stubEnv('STRIPE_PRICE_GROWTH_YEARLY', 'price_gy');

const { POST } = await import('./route');

const stripe = new Stripe('sk_test_123');

const eventFixture = (type: string, object: unknown, id = 'evt_1') => ({
  id,
  object: 'event',
  api_version: '2026-08-26.dahlia',
  created: 1_700_000_000,
  livemode: false,
  pending_webhooks: 1,
  request: null,
  type,
  data: { object },
});

const checkoutSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'cs_1',
  object: 'checkout.session',
  mode: 'subscription',
  client_reference_id: ACCOUNT,
  customer: 'cus_1',
  subscription: 'sub_1',
  metadata: { account_id: ACCOUNT },
  ...overrides,
});

const post = async (
  payload: unknown,
  { secret = SECRET, header }: { secret?: string; header?: string | null } = {},
) => {
  const body = JSON.stringify(payload);
  const signature =
    header === undefined
      ? await stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret })
      : header;
  const headers = new Headers({ 'content-type': 'application/json' });

  if (signature) {
    headers.set('stripe-signature', signature);
  }

  return POST(
    new Request('http://localhost/api/stripe/webhook', { method: 'POST', headers, body }),
  );
};

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    memory = createMemoryStore([ACCOUNT, OTHER]);
    retrieveSubscription.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('rejects a request without a signature', async () => {
    const response = await post(eventFixture('checkout.session.completed', checkoutSession()), {
      header: null,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Missing Stripe signature.' });
    expect(memory.saves).toHaveLength(0);
  });

  it('rejects every event while no webhook secret is configured, without saying so', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await post(eventFixture('checkout.session.completed', checkoutSession()));
    const unsigned = await post(eventFixture('checkout.session.completed', checkoutSession()), {
      header: null,
    });

    // The caller learns only that the signature did not verify; the reason is in the server log.
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid Stripe signature.' });
    expect(unsigned.status).toBe(400);
    await expect(unsigned.json()).resolves.toEqual({ error: 'Missing Stripe signature.' });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('STRIPE_WEBHOOK_SECRET'));
    expect(memory.saves).toHaveLength(0);
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET);
    logged.mockRestore();
  });

  it('does not tell the caller when the Stripe key is missing either', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await post(eventFixture('checkout.session.completed', checkoutSession()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid Stripe signature.' });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('Stripe is not configured'),
      expect.stringContaining('STRIPE_SECRET_KEY'),
    );
    expect(memory.saves).toHaveLength(0);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    logged.mockRestore();
  });

  it('rejects a signature made with another secret and logs why', async () => {
    const response = await post(eventFixture('checkout.session.completed', checkoutSession()), {
      secret: 'whsec_wrong',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid Stripe signature.' });
    expect(console.warn).toHaveBeenCalledWith(
      '[stripe webhook] signature check failed',
      expect.any(String),
    );
    expect(memory.saves).toHaveLength(0);
  });

  it('rejects a tampered body', async () => {
    const payload = JSON.stringify(eventFixture('checkout.session.completed', checkoutSession()));
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: SECRET,
    });
    const response = await POST(
      new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': signature },
        body: payload.replace(ACCOUNT, OTHER),
      }),
    );

    expect(response.status).toBe(400);
  });

  it('applies a completed checkout to the account named by client_reference_id', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionFixture({ metadata: {} }));

    const response = await post(eventFixture('checkout.session.completed', checkoutSession()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, handled: true });
    expect(retrieveSubscription).toHaveBeenCalledWith('sub_1');
    expect(memory.rows.get(ACCOUNT)).toMatchObject({
      plan_id: 'starter',
      billing_interval: 'monthly',
      status: 'active',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      current_period_end: new Date(PERIOD_END * 1000).toISOString(),
      cancel_at_period_end: false,
    });
    expect(memory.rows.get(OTHER)).toMatchObject({
      plan_id: 'hobby',
      stripe_subscription_id: null,
    });
  });

  it('falls back to the subscription metadata when the session carries no reference', async () => {
    retrieveSubscription.mockResolvedValue(
      subscriptionFixture({ metadata: { account_id: ACCOUNT } }),
    );

    await post(
      eventFixture(
        'checkout.session.completed',
        checkoutSession({ client_reference_id: null, metadata: {} }),
      ),
    );

    expect(memory.rows.get(ACCOUNT)).toMatchObject({
      plan_id: 'starter',
      stripe_subscription_id: 'sub_1',
    });
  });

  it('changes nothing when the same event is delivered twice', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionFixture());
    const event = eventFixture('checkout.session.completed', checkoutSession());

    await post(event);
    const after = { ...memory.rows.get(ACCOUNT) };
    await post(event);

    expect(memory.saves).toHaveLength(1);
    expect(memory.rows.get(ACCOUNT)).toEqual(after);
  });

  it('keeps the plan and marks it past due', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionFixture());
    await post(eventFixture('checkout.session.completed', checkoutSession()));

    const response = await post(
      eventFixture(
        'customer.subscription.updated',
        subscriptionFixture({ status: 'past_due' }),
        'evt_2',
      ),
    );

    expect(response.status).toBe(200);
    expect(memory.rows.get(ACCOUNT)).toMatchObject({ plan_id: 'starter', status: 'past_due' });
  });

  it('keeps the account on Hobby until an incomplete first payment goes through', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionFixture({ status: 'incomplete' }));
    await post(eventFixture('checkout.session.completed', checkoutSession()));

    expect(memory.rows.get(ACCOUNT)).toMatchObject({
      plan_id: 'hobby',
      status: 'incomplete',
      billing_interval: null,
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
    });

    await post(
      eventFixture(
        'customer.subscription.updated',
        subscriptionFixture({ status: 'active' }),
        'evt_2',
      ),
    );

    expect(memory.rows.get(ACCOUNT)).toMatchObject({
      plan_id: 'starter',
      status: 'active',
      billing_interval: 'monthly',
    });
  });

  it('ends an incomplete subscription that expired unpaid', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionFixture({ status: 'incomplete' }));
    await post(eventFixture('checkout.session.completed', checkoutSession()));

    await post(
      eventFixture(
        'customer.subscription.updated',
        subscriptionFixture({ status: 'incomplete_expired' }),
        'evt_2',
      ),
    );

    expect(memory.rows.get(ACCOUNT)).toMatchObject({
      plan_id: 'hobby',
      status: 'canceled',
      billing_interval: null,
    });
  });

  it('copies cancel_at_period_end and a new period end', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionFixture());
    await post(eventFixture('checkout.session.completed', checkoutSession()));

    const later = PERIOD_END + 86_400;
    await post(
      eventFixture(
        'customer.subscription.updated',
        subscriptionFixture({
          cancel_at_period_end: true,
          items: {
            object: 'list',
            data: [{ id: 'si_1', price: { id: 'price_sm' }, current_period_end: later }],
          },
        }),
        'evt_3',
      ),
    );

    expect(memory.rows.get(ACCOUNT)).toMatchObject({
      plan_id: 'starter',
      status: 'active',
      cancel_at_period_end: true,
      current_period_end: new Date(later * 1000).toISOString(),
    });
  });

  it('moves to a new plan when the price changes', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionFixture());
    await post(eventFixture('checkout.session.completed', checkoutSession()));

    await post(
      eventFixture(
        'customer.subscription.updated',
        subscriptionFixture({
          items: {
            object: 'list',
            data: [{ id: 'si_1', price: { id: 'price_gy' }, current_period_end: PERIOD_END }],
          },
        }),
        'evt_4',
      ),
    );

    expect(memory.rows.get(ACCOUNT)).toMatchObject({
      plan_id: 'growth',
      billing_interval: 'yearly',
      status: 'active',
    });
  });

  it('drops to Hobby when the subscription is deleted', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionFixture());
    await post(eventFixture('checkout.session.completed', checkoutSession()));

    const response = await post(
      eventFixture(
        'customer.subscription.deleted',
        subscriptionFixture({ status: 'canceled', cancel_at_period_end: true }),
        'evt_5',
      ),
    );

    expect(response.status).toBe(200);
    expect(memory.rows.get(ACCOUNT)).toMatchObject({
      plan_id: 'hobby',
      status: 'canceled',
      billing_interval: null,
      cancel_at_period_end: true,
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
    });
  });

  it('finds the account by subscription id when metadata is missing', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionFixture());
    await post(eventFixture('checkout.session.completed', checkoutSession()));

    await post(
      eventFixture(
        'customer.subscription.updated',
        subscriptionFixture({ status: 'past_due', metadata: {} }),
        'evt_6',
      ),
    );

    expect(memory.rows.get(ACCOUNT)).toMatchObject({ status: 'past_due' });
  });

  it('ignores lifecycle events for a subscription the account has moved on from', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionFixture({ id: 'sub_new', metadata: {} }));
    await post(
      eventFixture('checkout.session.completed', checkoutSession({ subscription: 'sub_new' })),
    );

    await post(
      eventFixture(
        'customer.subscription.deleted',
        subscriptionFixture({ id: 'sub_old', status: 'canceled' }),
        'evt_7',
      ),
    );

    expect(memory.rows.get(ACCOUNT)).toMatchObject({
      plan_id: 'starter',
      status: 'active',
      stripe_subscription_id: 'sub_new',
    });
  });

  it('adopts a new subscription once the previous one has ended', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionFixture({ id: 'sub_old' }));
    await post(
      eventFixture('checkout.session.completed', checkoutSession({ subscription: 'sub_old' })),
    );
    await post(
      eventFixture(
        'customer.subscription.deleted',
        subscriptionFixture({ id: 'sub_old', status: 'canceled' }),
        'evt_8',
      ),
    );

    expect(memory.rows.get(ACCOUNT)).toMatchObject({
      plan_id: 'hobby',
      status: 'canceled',
      stripe_subscription_id: 'sub_old',
    });

    // Resubscribing through the portal creates a subscription without our metadata; the customer id ties it back.
    await post(
      eventFixture(
        'customer.subscription.updated',
        subscriptionFixture({
          id: 'sub_again',
          metadata: {},
          items: {
            object: 'list',
            data: [{ id: 'si_2', price: { id: 'price_gm' }, current_period_end: PERIOD_END }],
          },
        }),
        'evt_9',
      ),
    );

    expect(memory.rows.get(ACCOUNT)).toMatchObject({
      plan_id: 'growth',
      billing_interval: 'monthly',
      status: 'active',
      stripe_subscription_id: 'sub_again',
      stripe_customer_id: 'cus_1',
    });
  });

  it('falls back to Hobby and logs when the price is unknown', async () => {
    retrieveSubscription.mockResolvedValue(
      subscriptionFixture({
        items: {
          object: 'list',
          data: [{ id: 'si_1', price: { id: 'price_mystery' }, current_period_end: PERIOD_END }],
        },
      }),
    );

    await post(eventFixture('checkout.session.completed', checkoutSession()));

    expect(memory.rows.get(ACCOUNT)).toMatchObject({
      plan_id: 'hobby',
      status: 'active',
      stripe_subscription_id: 'sub_1',
    });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('price_mystery'));
  });

  it('acknowledges events for an account it cannot find', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionFixture({ metadata: {} }));

    const response = await post(
      eventFixture(
        'checkout.session.completed',
        checkoutSession({
          client_reference_id: '00000000-0000-4000-8000-0000000000ff',
          metadata: {},
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, handled: false });
    expect(memory.saves).toHaveLength(0);
  });

  it('acknowledges and ignores other event types', async () => {
    const response = await post(eventFixture('invoice.paid', { id: 'in_1', object: 'invoice' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, handled: false });
    expect(retrieveSubscription).not.toHaveBeenCalled();
    expect(memory.saves).toHaveLength(0);
  });

  it('answers 500 when the row cannot be written, so Stripe retries', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionFixture());
    memory.store.save = async () => {
      throw new Error('database away');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await post(eventFixture('checkout.session.completed', checkoutSession()));

    expect(response.status).toBe(500);
  });
});
