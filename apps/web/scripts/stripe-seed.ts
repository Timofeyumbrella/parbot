// Creates the Parbot products and prices in a Stripe test account and prints the env lines.
// Run with: pnpm --filter web stripe:seed   (node --env-file=../../.env, Node 24 strips the types)
//
// Idempotent: prices are found by lookup key, products by metadata, so re-running changes nothing.

import Stripe from 'stripe';

// Node resolves relative imports by URL, so the app's own modules are loaded with their .ts
// extension; the type annotations keep them typed without touching the app's tsconfig.
const load = <T>(relative: string) => import(new URL(relative, import.meta.url).href) as Promise<T>;

const { PLANS } = await load<typeof import('../src/lib/plans')>('../src/lib/plans.ts');
const { BILLING_INTERVALS, PAID_PLAN_IDS, PRICE_ENV_KEYS, lookupKeyFor } =
  await load<typeof import('../src/lib/billing/catalog')>('../src/lib/billing/catalog.ts');

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const key = process.env.STRIPE_SECRET_KEY?.trim();

if (!key) {
  fail('STRIPE_SECRET_KEY is empty. Put a Stripe test key (sk_test_...) in .env first.');
}

if (!/^(sk|rk)_test_/.test(key!)) {
  fail('Refusing to seed: STRIPE_SECRET_KEY is not a test key. This script only ever runs against test mode.');
}

const stripe = new Stripe(key!, { appInfo: { name: 'Parbot seed' } });

const findOrCreateProduct = async (planId: (typeof PAID_PLAN_IDS)[number]) => {
  const plan = PLANS[planId];
  const name = `Parbot ${plan.name}`;
  const existing = await stripe.products.list({ active: true, limit: 100 });
  const found = existing.data.find((product) => product.metadata.parbot_plan === planId);

  if (found) {
    console.log(`Product ${name}: ${found.id} (existing)`);

    return found;
  }

  const created = await stripe.products.create({
    name,
    description: plan.tagline,
    metadata: { parbot_plan: planId },
  });

  console.log(`Product ${name}: ${created.id} (created)`);

  return created;
};

const findOrCreatePrice = async (
  productId: string,
  planId: (typeof PAID_PLAN_IDS)[number],
  interval: (typeof BILLING_INTERVALS)[number],
) => {
  const plan = PLANS[planId];
  const lookupKey = lookupKeyFor(planId, interval);
  const unitAmount = interval === 'yearly' ? plan.yearlyCents : plan.monthlyCents;
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  const found = existing.data[0];

  if (found) {
    if (found.unit_amount !== unitAmount) {
      console.warn(
        `  Price ${lookupKey} exists with amount ${found.unit_amount}, but PLANS says ${unitAmount}. Archive it in Stripe to recreate.`,
      );
    }

    console.log(`  Price ${lookupKey}: ${found.id} (existing)`);

    return found;
  }

  const created = await stripe.prices.create({
    product: productId,
    currency: 'usd',
    unit_amount: unitAmount,
    recurring: { interval: interval === 'yearly' ? 'year' : 'month' },
    lookup_key: lookupKey,
    nickname: `${plan.name} ${interval}`,
  });

  console.log(`  Price ${lookupKey}: ${created.id} (created)`);

  return created;
};

const envLines: string[] = [];

for (const planId of PAID_PLAN_IDS) {
  const product = await findOrCreateProduct(planId);

  for (const interval of BILLING_INTERVALS) {
    const price = await findOrCreatePrice(product.id, planId, interval);

    envLines.push(`${PRICE_ENV_KEYS[planId][interval]}=${price.id}`);
  }
}

console.log('\nPaste these into .env:\n');
console.log(envLines.join('\n'));
console.log('');
