import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MarketingNav } from './nav';

describe('MarketingNav', () => {
  afterEach(cleanup);

  it('links to the sections and the account routes', () => {
    render(<MarketingNav />);

    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0]!;

    expect(within(nav).getByRole('link', { name: 'Product' })).toHaveAttribute('href', '/#product');
    expect(within(nav).getByRole('link', { name: 'How it works' })).toHaveAttribute(
      'href',
      '/#how-it-works',
    );
    expect(within(nav).getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/#pricing');
    expect(within(nav).getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/#faq');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'Parbot home' })).toHaveAttribute('href', '/');
  });

  it('gets its border once the page has scrolled', async () => {
    render(<MarketingNav />);

    const header = screen.getByRole('banner');

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(header).toHaveAttribute('data-scrolled', 'false');
    expect(header.className).toContain('border-transparent');

    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true });

    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(header).toHaveAttribute('data-scrolled', 'true');
    expect(header.className).toContain('border-border');
  });
});
