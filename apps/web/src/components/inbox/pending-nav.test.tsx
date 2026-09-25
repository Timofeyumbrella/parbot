import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense, use, useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { PendingNav, PendingRegion, SegmentedLink } from './pending-nav';

const Switch = () => (
  <PendingNav>
    <nav>
      <SegmentedLink
        href="/a/x?days=7"
        group="period"
        active={false}
        activeClassName="on"
        inactiveClassName="off"
      >
        7 days
      </SegmentedLink>
      <SegmentedLink
        href="/a/x?days=30"
        group="period"
        active
        activeClassName="on"
        inactiveClassName="off"
      >
        30 days
      </SegmentedLink>
    </nav>
    <PendingRegion>
      <p>content</p>
    </PendingRegion>
  </PendingNav>
);

/** Stands in for the router: the navigation it starts suspends until the test lets it go. */
const never = new Promise<never>(() => {});
const navigation = { start: () => {} };

const Destination = () => {
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    navigation.start = () => setNavigating(true);
  }, []);

  if (navigating) {
    use(never);
  }

  return null;
};

describe('SegmentedLink', () => {
  beforeEach(() => {
    router.push.mockReset();
  });

  it('marks the active link and stays a real link', () => {
    render(<Switch />);

    const thirty = screen.getByRole('link', { name: '30 days' });
    expect(thirty).toHaveAttribute('aria-current', 'page');
    expect(thirty).toHaveClass('on');
    expect(thirty).toHaveAttribute('href', '/a/x?days=30');
    expect(screen.getByRole('link', { name: '7 days' })).toHaveClass('off');
  });

  it('routes a plain click through the router without scrolling to the top', async () => {
    const user = userEvent.setup();
    render(<Switch />);

    await user.click(screen.getByRole('link', { name: '7 days' }));

    expect(router.push).toHaveBeenCalledWith('/a/x?days=7', { scroll: false });
  });

  it('leaves modified clicks to the browser so open-in-new-tab keeps working', async () => {
    const user = userEvent.setup();
    render(<Switch />);

    await user.keyboard('{Meta>}');
    await user.click(screen.getByRole('link', { name: '7 days' }));
    await user.keyboard('{/Meta}');

    expect(router.push).not.toHaveBeenCalled();
  });

  it('moves only the clicked switch while the navigation is pending', async () => {
    // Regression: a filter click took the underline off the Conversations tab until the server
    // answered, because every switch under the provider compared itself with the clicked href.
    router.push.mockImplementation(() => navigation.start());
    const user = userEvent.setup();

    render(
      <PendingNav>
        <nav aria-label="Tabs">
          <SegmentedLink href="/inbox" group="tab" active activeClassName="on">
            Conversations
          </SegmentedLink>
          <SegmentedLink href="/inbox?tab=leads" group="tab" active={false} activeClassName="on">
            Leads
          </SegmentedLink>
        </nav>
        <nav aria-label="Filter">
          <SegmentedLink href="/inbox" group="filter" active activeClassName="on">
            All
          </SegmentedLink>
          <SegmentedLink href="/inbox?filter=widget" group="filter" active={false}>
            Widget
          </SegmentedLink>
        </nav>
        <PendingRegion>
          <Suspense fallback={null}>
            <Destination />
          </Suspense>
        </PendingRegion>
      </PendingNav>,
    );

    await act(() => user.click(screen.getByRole('link', { name: 'Widget' })));

    expect(screen.getByRole('link', { name: 'Widget' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'All' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Conversations' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('Conversations').closest('a')).toHaveClass('on');
  });
});
