import type { Metadata } from 'next';
import Script from 'next/script';

import { ClosingCta } from '@/components/marketing/closing-cta';
import { demoAssistantKey } from '@/components/marketing/demo-key';
import { EmbedModes } from '@/components/marketing/embed-modes';
import { Faq } from '@/components/marketing/faq';
import { Features } from '@/components/marketing/features';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { orderedPlans } from '@/components/marketing/plan-copy';
import { Pricing } from '@/components/marketing/pricing';
import { publicEnv } from '@/lib/env';

const TITLE = 'Parbot · Ask-AI for developer docs';
const DESCRIPTION =
  'Add an assistant to your developer docs with one script tag. Streamed answers with citations in a floating bubble or a ⌘K palette, and an inbox with the questions your docs did not answer.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    siteName: 'Parbot',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
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
      {demoKey ? (
        <Script src="/widget.js" data-parbot={demoKey} data-mode="palette" strategy="afterInteractive" />
      ) : null}
    </main>
  );
}
