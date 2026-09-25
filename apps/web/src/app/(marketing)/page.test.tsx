import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FAQ_ITEMS } from '@/components/marketing/faq';
import { FEATURES } from '@/components/marketing/features';
import { HERO_HEADLINE } from '@/components/marketing/hero';
import { formatPrice, PLAN_ORDER, PLANS } from '@/lib/plans';

import LandingPage from './page';

const SECTION_IDS = ['product', 'how-it-works', 'features', 'pricing', 'faq', 'closing'];

const section = (headingId: string) => {
  const element = document.querySelector(`[aria-labelledby="${headingId}"]`);

  if (!(element instanceof HTMLElement)) {
    throw new Error(`No section labelled by ${headingId}`);
  }

  return within(element);
};

describe('landing page', () => {
  // The developer's .env may carry a real demo key; each case says which demo it wants.
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_ASSISTANT_KEY', '');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders the hero and every section under a main landmark', () => {
    // The scripted demo is asserted below, so a developer's own demo key must not swap it out.
    vi.stubEnv('NEXT_PUBLIC_DEMO_ASSISTANT_KEY', '');
    render(<LandingPage />);

    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(HERO_HEADLINE);

    const hero = section('hero-heading');

    expect(hero.getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/signup');
    expect(hero.getByRole('link', { name: 'See pricing' })).toHaveAttribute('href', '/#pricing');

    for (const id of SECTION_IDS) {
      const heading = document.getElementById(`${id}-heading`);

      expect(heading, `${id} heading`).toBeInTheDocument();
      expect(heading?.textContent?.trim()).not.toBe('');
    }

    expect(screen.getByRole('figure', { name: /example conversation/i })).toBeInTheDocument();
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(2);
  });

  it('lists six features and six questions', () => {
    render(<LandingPage />);

    expect(FEATURES).toHaveLength(6);
    expect(FAQ_ITEMS).toHaveLength(6);

    const features = section('features-heading');

    for (const feature of FEATURES) {
      expect(features.getByRole('heading', { level: 3, name: feature.title })).toBeInTheDocument();
    }

    // Citations only link when the source is a web page; uploads and pasted text have no URL.
    expect(FEATURES.find((feature) => feature.title === 'Cites the page')?.body).toMatch(
      /with a link whenever the source is a web page/,
    );

    expect(document.getElementById('faq')?.querySelectorAll('details')).toHaveLength(6);
  });

  it('shows the three plans with names, monthly prices and highlights from PLANS', () => {
    render(<LandingPage />);

    for (const id of PLAN_ORDER) {
      const plan = PLANS[id];
      const card = within(screen.getByTestId(`plan-${id}`));

      expect(card.getByRole('heading', { level: 3 })).toHaveTextContent(plan.name);
      expect(card.getByTestId('plan-price')).toHaveTextContent(formatPrice(plan.monthlyCents));
      expect(card.getByRole('link')).toHaveAttribute('href', `/signup?plan=${id}&interval=monthly`);

      for (const highlight of plan.highlights) {
        expect(card.getByText(highlight)).toBeInTheDocument();
      }
    }

    expect(within(screen.getByTestId('plan-hobby')).getByRole('link')).toHaveTextContent(
      'Start free',
    );
    expect(screen.getByText('Recommended').closest('article')).toHaveAttribute(
      'data-testid',
      'plan-starter',
    );
  });

  it('switches the amounts and the signup links when yearly is chosen', async () => {
    const user = userEvent.setup();

    render(<LandingPage />);

    await user.click(screen.getByRole('button', { name: /yearly/i }));

    expect(screen.getByRole('button', { name: /yearly/i })).toHaveAttribute('aria-pressed', 'true');

    for (const id of PLAN_ORDER) {
      const card = within(screen.getByTestId(`plan-${id}`));

      expect(card.getByTestId('plan-price')).toHaveTextContent(formatPrice(PLANS[id].yearlyCents));
      expect(card.getByRole('link')).toHaveAttribute('href', `/signup?plan=${id}&interval=yearly`);
    }

    await user.click(screen.getByRole('button', { name: /monthly/i }));

    expect(within(screen.getByTestId('plan-growth')).getByTestId('plan-price')).toHaveTextContent(
      formatPrice(PLANS.growth.monthlyCents),
    );
  });

  it('runs the scripted demo and no widget script without a demo key', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_ASSISTANT_KEY', '');

    render(<LandingPage />);

    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    expect(screen.queryByText(/to try it here/)).not.toBeInTheDocument();
    expect(document.querySelector('script[data-parbot]')).toBeNull();
  });

  it('shows the live panel and the keyboard hint when a demo key is set', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_ASSISTANT_KEY', 'pb_demo_key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }));

    render(<LandingPage />);

    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Ask a question' })).toBeInTheDocument();
    expect(screen.getByText(/to try it here/)).toBeInTheDocument();
    expect(screen.getByText(/ask the assistant on this page/)).toBeInTheDocument();
    expect(document.querySelector('script[data-parbot]')).toHaveAttribute(
      'data-parbot',
      'pb_demo_key',
    );
  });
});
