import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ pathname: '/a/asst', assistantId: 'asst' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useParams: () => ({ assistantId: navigation.assistantId }),
}));

// The router is not under test: a click only has to reach the link's own handler.
vi.mock('next/link', () => ({
  default: ({
    href,
    onClick,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

vi.mock('@/actions/auth', () => ({ signOut: vi.fn() }));

import { AppSidebar } from './app-sidebar';
import { NavPendingProvider, PendingMain } from './nav-pending';

const Frame = () => (
  <NavPendingProvider>
    <AppSidebar
      assistants={[{ id: 'asst', name: 'Acme Docs', slug: 'acme-docs' }]}
      email="owner@acme.test"
      planName="Hobby"
    />
    <PendingMain>
      <h1>Overview</h1>
    </PendingMain>
  </NavPendingProvider>
);

const assistantNav = () => within(screen.getAllByRole('navigation', { name: 'Assistant' })[0]!);

describe('AppSidebar', () => {
  beforeEach(() => {
    navigation.pathname = '/a/asst';
  });

  it('moves the highlight and dims the page in the click frame, before the route changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Frame />);

    expect(assistantNav().getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('main')).not.toHaveAttribute('aria-busy');

    await user.click(assistantNav().getByRole('link', { name: 'Knowledge' }));

    // The router has not moved (the pathname is still the Overview's), yet the click shows.
    expect(assistantNav().getByRole('link', { name: 'Knowledge' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(assistantNav().getByRole('link', { name: 'Overview' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');

    navigation.pathname = '/a/asst/knowledge';
    rerender(<Frame />);

    expect(assistantNav().getByRole('link', { name: 'Knowledge' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('main')).not.toHaveAttribute('aria-busy');

    // Back to the Overview through the browser: the earlier click does not come back.
    navigation.pathname = '/a/asst';
    rerender(<Frame />);

    expect(assistantNav().getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(assistantNav().getByRole('link', { name: 'Knowledge' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('main')).not.toHaveAttribute('aria-busy');
  });

  it('leaves a modified click to the browser and ignores a click on the open screen', async () => {
    const user = userEvent.setup();
    render(<Frame />);

    await user.keyboard('{Meta>}');
    await user.click(assistantNav().getByRole('link', { name: 'Inbox' }));
    await user.keyboard('{/Meta}');

    expect(assistantNav().getByRole('link', { name: 'Inbox' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('main')).not.toHaveAttribute('aria-busy');

    await user.click(assistantNav().getByRole('link', { name: 'Overview' }));

    expect(screen.getByRole('main')).not.toHaveAttribute('aria-busy');
  });
});
