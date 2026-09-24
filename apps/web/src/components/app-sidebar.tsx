'use client';

import { cn } from 'cn';
import {
  BarChart3,
  BookOpen,
  Bot,
  ChevronsUpDown,
  Code2,
  CreditCard,
  Inbox,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Settings,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';

import { signOut } from '@/actions/auth';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { AssistantSummary } from '@/lib/assistants';

type AppSidebarProps = {
  assistants: AssistantSummary[];
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

export const Brand = ({ className }: { className?: string }) => (
  <Link href="/dashboard" className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
    <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
      <Bot className="size-4" />
    </span>
    Parbot
  </Link>
);

const SidebarBody = ({ assistants, email, planName, onNavigate }: AppSidebarProps & { onNavigate?: () => void }) => {
  const pathname = usePathname();
  const params = useParams<{ assistantId?: string }>();
  const [, startSignOut] = useTransition();
  const active = assistants.find((assistant) => assistant.id === params.assistantId) ?? assistants[0] ?? null;

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center justify-between px-1 pt-1">
        <Brand />
        <ThemeToggle />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-9 w-full justify-between px-2.5" aria-label="Switch assistant">
            <span className="flex min-w-0 items-center gap-2">
              <Bot className="text-muted-foreground size-4 shrink-0" />
              <span className="truncate">{active?.name ?? 'No assistant yet'}</span>
            </span>
            <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Assistants</DropdownMenuLabel>
          {assistants.map((assistant) => (
            <DropdownMenuItem key={assistant.id} asChild>
              <Link href={`/a/${assistant.id}`} onClick={onNavigate}>
                <Bot />
                <span className="truncate">{assistant.name}</span>
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/onboarding" onClick={onNavigate}>
              <Plus />
              New assistant
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <nav className="flex flex-col gap-0.5" aria-label="Assistant">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          prefetch
          className={cn(
            'mb-1 flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
            isActive('/dashboard', true)
              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
              : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
          )}
        >
          <LayoutGrid className="size-4" />
          All assistants
        </Link>
        {active
          ? assistantNav(active.id).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                prefetch
                className={cn(
                  'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                  isActive(item.href, item.exact)
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))
          : null}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5" aria-label="Account">
        {accountNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
              isActive(item.href)
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
            )}
          >
            <item.icon className="size-4" />
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
        <Brand />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Open menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="bg-sidebar w-72 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SidebarBody {...props} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
      <div className="h-12 md:hidden" aria-hidden="true" />
    </>
  );
};
