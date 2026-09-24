import { type Plan, PLAN_ORDER, PLANS } from '@/lib/plans';

/** "Starter and Growth", "Hobby, Starter and Growth". */
export const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/** Names of the plans that include a gated feature, so copy never hardcodes them. */
export const plansWith = (feature: 'leadCapture' | 'palette' | 'customTheme' | 'hideBranding') =>
  joinNames(PLAN_ORDER.filter((id) => PLANS[id][feature]).map((id) => PLANS[id].name));

export const orderedPlans = (): Plan[] => PLAN_ORDER.map((id) => PLANS[id]);

export const formatCount = (value: number) => value.toLocaleString('en-US');
