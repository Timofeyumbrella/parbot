'use client';

import { cn } from 'cn';
import {
  BarChart3,
  BookOpen,
  Bot,
  Code2,
  CreditCard,
  Inbox,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Settings,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';

import { signOut } from '@/actions/auth';
import { isPlainLeftClick, useNavPending } from '@/components/nav-pending';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { AssistantSummary } from '@/lib/assistants';

type AppSidebarProps = {
  /** The account's one assistant, or null until onboarding has created it. */
  assistant: AssistantSummary | null;
  email: string;
  planName: string;
};

const assistantNav = (assistantId: string) => [
  { href: `/a/${assistantId}`, label: 'Overview', icon: BarChart3, exact: true },
  { href: `/a/${assistantId}/chat`, label: 'Chat', icon: MessageSquare },
  { href: `/a/${assistantId}/knowledge`, label: 'Knowledge', icon: BookOpen },
  { href: `/a/${assistantId}/inbox`, label: 'Inbox', icon: Inbox },
  { href: `/a/${assistantId}/widget`, label: 'Widget', icon: Code2 },
  { href: `/a/${assistantId}/settings`, label: 'Settings', icon: Settings },
];

const accountNav = [
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/account', label: 'Account', icon: UserRound },
];

/** Links straight to where /dashboard would redirect, so the click costs one round trip, not two. */
const Brand = ({ href, className }: { href: string; className?: string }) => (
  <Link
    href={href}
    className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}
  >
    <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
      <Bot className="size-4" />
    </span>
    Parbot
  </Link>
);

const homeOf = (assistant: AssistantSummary | null) =>
  assistant ? `/a/${assistant.id}` : '/onboarding';

const navItemClass = (active: boolean) =>
  cn(
    'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
    active
      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
  );

const SidebarBody = ({
  assistant,
  email,
  planName,
  onNavigate,
  inSheet = false,
}: AppSidebarProps & { onNavigate?: () => void; inSheet?: boolean }) => {
  const pathname = usePathname();
  const [, startSignOut] = useTransition();
  const pending = useNavPending();

  // A clicked item is highlighted from the click on, not from when the router gets there.
  const isActive = (href: string, exact = false) =>
    pending.href
      ? pending.href === href
      : exact
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`);

  const follow = (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (isPlainLeftClick(event)) {
      pending.start(href);
    }

    onNavigate?.();
  };

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      {/* In the phone sheet the close button sits top right; the toggle moves left of it. */}
      <div className={cn('flex items-center justify-between px-1 pt-1', inSheet && 'pr-9')}>
        <Brand href={homeOf(assistant)} />
        <ThemeToggle />
      </div>

      {assistant ? (
        <>
          {/* A label, not a menu: an account has one assistant, so there is nothing to switch to. */}
          <div className="flex min-w-0 items-center gap-2.5 px-1" data-testid="sidebar-assistant">
            <span className="bg-primary/15 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
              <Bot className="size-4" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-muted-foreground text-xs leading-tight">Assistant</span>
              <span className="truncate text-sm font-medium leading-snug" title={assistant.name}>
                {assistant.name}
              </span>
            </span>
          </div>

          <nav className="flex flex-col gap-0.5" aria-label="Assistant">
            {assistantNav(assistant.id).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={follow(item.href)}
                aria-current={isActive(item.href, item.exact) ? 'page' : undefined}
                className={navItemClass(isActive(item.href, item.exact))}
              >
                <item.icon
                  className={cn('size-4', pending.href === item.href && 'animate-pulse')}
                />
                {item.label}
              </Link>
            ))}
          </nav>
        </>
      ) : (
        <nav className="flex flex-col gap-0.5" aria-label="Assistant">
          <Link
            href="/onboarding"
            onClick={follow('/onboarding')}
            aria-current={isActive('/onboarding') ? 'page' : undefined}
            className={navItemClass(isActive('/onboarding'))}
          >
            <Plus className={cn('size-4', pending.href === '/onboarding' && 'animate-pulse')} />
            Set up your assistant
          </Link>
        </nav>
      )}

      <div className="mt-auto flex flex-col gap-0.5" aria-label="Account">
        {accountNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={follow(item.href)}
            aria-current={isActive(item.href) ? 'page' : undefined}
            className={navItemClass(isActive(item.href))}
          >
            <item.icon className={cn('size-4', pending.href === item.href && 'animate-pulse')} />
            {item.label}
            {item.href === '/billing' ? (
              <span className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                {planName}
              </span>
            ) : null}
          </Link>
        ))}
        <div className="border-sidebar-border mt-2 flex items-center justify-between gap-2 border-t px-2.5 pt-3">
          <span className="text-muted-foreground truncate text-xs" title={email}>
            {email}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Sign out"
            onClick={() => startSignOut(() => signOut())}
          >
            <LogOut />
          </Button>
        </div>
      </div>
    </div>
  );
};

export const AppSidebar = (props: AppSidebarProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border sticky top-0 hidden h-svh w-60 shrink-0 border-r md:block">
        <SidebarBody {...props} />
      </aside>

      <div className="bg-background/90 fixed inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b px-3 backdrop-blur md:hidden">
        <Brand href={homeOf(props.assistant)} />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Open menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="bg-sidebar w-72 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SidebarBody {...props} inSheet onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
};
