import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { PendingNav, PendingRegion, SegmentedLink } from './pending-nav';

const Switch = () => (
  <PendingNav>
    <nav>
      <SegmentedLink href="/a/x?days=7" active={false} activeClassName="on" inactiveClassName="off">
        7 days
      </SegmentedLink>
      <SegmentedLink href="/a/x?days=30" active activeClassName="on" inactiveClassName="off">
        30 days
      </SegmentedLink>
    </nav>
    <PendingRegion>
      <p>content</p>
    </PendingRegion>
  </PendingNav>
);

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
});
