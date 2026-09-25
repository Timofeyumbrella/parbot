import type { Metadata } from 'next';

import { MarketingFooter } from '@/components/marketing/footer';
import { MarketingNav } from '@/components/marketing/nav';
import { publicEnv } from '@/lib/env';

/** Lets the Open Graph image and canonical URLs resolve to absolute addresses. */
export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
};

export default function MarketingLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="focus:bg-primary focus:text-primary-foreground sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <MarketingNav />
      {children}
      <MarketingFooter />
    </div>
  );
}
