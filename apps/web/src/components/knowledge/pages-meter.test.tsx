import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PagesMeter } from './pages-meter';

describe('PagesMeter', () => {
  it('shows the count against the plan and stays quiet with room to spare', () => {
    render(<PagesMeter used={40} plan={{ name: 'Starter', pages: 2000 }} />);

    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('of 2,000 pages')).toBeInTheDocument();
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByLabelText('40 of 2000 pages used on the Starter plan')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('points at billing when the plan is nearly used up, and says so at the limit', () => {
    const { rerender } = render(<PagesMeter used={85} plan={{ name: 'Hobby', pages: 100 }} />);

    expect(screen.getByRole('link', { name: 'Close to the limit. See plans on Billing' })).toHaveAttribute('href', '/billing');

    rerender(<PagesMeter used={100} plan={{ name: 'Hobby', pages: 100 }} />);

    expect(screen.getByRole('link', { name: 'Page limit reached. Upgrade on Billing' })).toHaveAttribute('href', '/billing');
  });
});
