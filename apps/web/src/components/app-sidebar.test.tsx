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

import type { AssistantSummary } from '@/lib/assistants';

import { AppSidebar } from './app-sidebar';
import { NavPendingProvider, PendingMain } from './nav-pending';

const ACME: AssistantSummary = { id: 'asst', name: 'Acme Docs', slug: 'acme-docs' };

const Frame = ({ assistant = ACME }: { assistant?: AssistantSummary | null }) => (
  <NavPendingProvider>
    <AppSidebar assistant={assistant} email="owner@acme.test" planName="Hobby" />
    <PendingMain>
      <h1>Overview</h1>
    </PendingMain>
  </NavPendingProvider>
);

const assistantNav = () => within(screen.getAllByRole('navigation', { name: 'Assistant' })[0]!);

const linksOf = (scope: ReturnType<typeof within>) =>
  scope
    .getAllByRole('link')
    .map((link: HTMLElement) => [link.textContent, link.getAttribute('href')]);

describe('AppSidebar', () => {
  beforeEach(() => {
    navigation.pathname = '/a/asst';
  });

  it("shows the account's one assistant by name and its sections directly, with nothing to switch", () => {
    render(<Frame />);

    const sidebar = within(screen.getByRole('complementary'));

    expect(sidebar.getByText('Acme Docs')).toBeInTheDocument();
    expect(linksOf(assistantNav())).toEqual([
      ['Overview', '/a/asst'],
      ['Chat', '/a/asst/chat'],
      ['Knowledge', '/a/asst/knowledge'],
      ['Inbox', '/a/asst/inbox'],
      ['Widget', '/a/asst/widget'],
      ['Settings', '/a/asst/settings'],
    ]);
    expect(sidebar.getByRole('link', { name: /Billing/ })).toHaveAttribute('href', '/billing');
    expect(sidebar.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account');

    // The name is a label: no switcher, no way to another assistant or to a list of them.
    expect(sidebar.queryByRole('button', { name: /switch assistant/i })).not.toBeInTheDocument();
    expect(sidebar.getByText('Acme Docs').closest('button, a')).toBeNull();
    expect(screen.queryByText(/all assistants/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/new assistant/i)).not.toBeInTheDocument();
    expect(document.querySelector('[aria-haspopup="menu"]')).toBeNull();
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();

    // The wordmark opens the Overview directly instead of bouncing through /dashboard.
    for (const brand of screen.getAllByRole('link', { name: 'Parbot' })) {
      expect(brand).toHaveAttribute('href', '/a/asst');
    }
  });

  it('points an account without an assistant yet at onboarding', () => {
    navigation.pathname = '/onboarding';
    render(<Frame assistant={null} />);

    expect(linksOf(assistantNav())).toEqual([['Set up your assistant', '/onboarding']]);
    expect(assistantNav().getByRole('link')).toHaveAttribute('aria-current', 'page');

    for (const brand of screen.getAllByRole('link', { name: 'Parbot' })) {
      expect(brand).toHaveAttribute('href', '/onboarding');
    }
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

    expect(assistantNav().getByRole('link', { name: 'Inbox' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('main')).not.toHaveAttribute('aria-busy');

    await user.click(assistantNav().getByRole('link', { name: 'Overview' }));

    expect(screen.getByRole('main')).not.toHaveAttribute('aria-busy');
  });
});
