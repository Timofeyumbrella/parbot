import type { Metadata } from 'next';

import { ClosingCta } from '@/components/marketing/closing-cta';
import { demoAssistantKey } from '@/components/marketing/demo-key';
import { DemoWidget } from '@/components/marketing/demo-widget';
import { EmbedModes } from '@/components/marketing/embed-modes';
import { Faq } from '@/components/marketing/faq';
import { Features } from '@/components/marketing/features';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { orderedPlans } from '@/components/marketing/plan-copy';
import { Pricing } from '@/components/marketing/pricing';
import { OG_IMAGE, SITE_DESCRIPTION, SITE_TITLE } from '@/components/marketing/site-meta';
import { publicEnv } from '@/lib/env';

/**
 * The image is named explicitly: a page-level openGraph object replaces the one the root
 * opengraph-image.tsx contributes, so without this the generated image would not be tagged.
 */
export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
    siteName: 'Parbot',
    type: 'website',
    locale: 'en_US',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default function LandingPage() {
  const demoKey = demoAssistantKey();

  return (
    <main id="main" tabIndex={-1} className="flex-1 outline-none">
      <Hero demoKey={demoKey} />
      <EmbedModes appUrl={publicEnv.appUrl} />
      <HowItWorks />
      <Features />
      <Pricing plans={orderedPlans()} />
      <Faq demoKey={demoKey} />
      <ClosingCta />
      {demoKey ? <DemoWidget demoKey={demoKey} /> : null}
    </main>
  );
}
