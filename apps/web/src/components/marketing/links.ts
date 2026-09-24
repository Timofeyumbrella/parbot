/** Anchors shared by the nav and the footer. Absolute so they also work from other marketing routes. */
export const NAV_LINKS = [
  { href: '/#product', label: 'Product' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
] as const;

export const ACCOUNT_LINKS = [
  { href: '/login', label: 'Sign in' },
  { href: '/signup', label: 'Start free' },
] as const;
