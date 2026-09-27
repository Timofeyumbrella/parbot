import type { PlanId } from '@parbot/shared';

export type PlanLimits = {
  pages: number;
  messagesPerMonth: number;
  hideBranding: boolean;
  palette: boolean;
  customTheme: boolean;
  leadCapture: boolean;
};

export type Plan = PlanLimits & {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyCents: number;
  yearlyCents: number;
  highlights: string[];
  featured?: boolean;
};

/** Yearly is twelve months for the price of ten. */
export const yearlyCents = (monthlyCents: number) => monthlyCents * 10;

export const PLANS: Record<PlanId, Plan> = {
  hobby: {
    id: 'hobby',
    name: 'Hobby',
    tagline: 'Put an assistant on one docs site and see what people ask.',
    monthlyCents: 0,
    yearlyCents: 0,
    pages: 100,
    messagesPerMonth: 200,
    hideBranding: false,
    palette: false,
    customTheme: false,
    leadCapture: false,
    highlights: ['100 indexed pages', '200 answers a month', 'Bubble widget'],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    tagline: 'For a product with real documentation and real users.',
    monthlyCents: 2900,
    yearlyCents: yearlyCents(2900),
    pages: 2000,
    messagesPerMonth: 3000,
    hideBranding: true,
    palette: true,
    customTheme: true,
    leadCapture: true,
    highlights: [
      '2,000 indexed pages',
      '3,000 answers a month',
      '⌘K palette mode and custom theme',
      'Lead capture when the docs fall short',
      'No Parbot branding',
    ],
    featured: true,
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    tagline: 'For large documentation and a steady stream of questions.',
    monthlyCents: 9900,
    yearlyCents: yearlyCents(9900),
    pages: 20000,
    messagesPerMonth: 20000,
    hideBranding: true,
    palette: true,
    customTheme: true,
    leadCapture: true,
    highlights: [
      '20,000 indexed pages',
      '20,000 answers a month',
      'Everything in Starter',
      'Room for large docs sites',
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ['hobby', 'starter', 'growth'];

export const isPlanId = (value: unknown): value is PlanId =>
  typeof value === 'string' && Object.hasOwn(PLANS, value);

export const planFor = (value: unknown): Plan => (isPlanId(value) ? PLANS[value] : PLANS.hobby);

export type CapacityVerdict = {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
};

export const checkCapacity = (
  planId: unknown,
  used: number,
  resource: 'pages' | 'messagesPerMonth',
): CapacityVerdict => {
  const limit = planFor(planId)[resource];

  return { allowed: used < limit, limit, used, remaining: Math.max(limit - used, 0) };
};

export const formatPrice = (cents: number) =>
  cents === 0 ? 'Free' : `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/** First day of the current UTC month, the key usage counters are stored under. */
export const usagePeriodStart = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
