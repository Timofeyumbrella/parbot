import { AppSidebar } from '@/components/app-sidebar';
import { NavPendingProvider, PendingMain } from '@/components/nav-pending';
import { getAccountPlan } from '@/lib/account';
import { listAssistants } from '@/lib/assistants';
import { requireUser } from '@/lib/session';

export default async function DashboardLayout({ children }: LayoutProps<'/'>) {
  const { user } = await requireUser();
  // The same request-cached read the Billing and Account pages use, so the sidebar names the plan
  // the account is entitled to (Hobby for an unpaid or ended subscription), never the raw row.
  const [assistants, account] = await Promise.all([listAssistants(), getAccountPlan()]);

  return (
    <NavPendingProvider>
      <div className="flex min-h-svh w-full">
        <AppSidebar assistants={assistants} email={user.email ?? ''} planName={account.plan.name} />
        <PendingMain className="flex min-w-0 flex-1 flex-col pt-12 md:pt-0">{children}</PendingMain>
      </div>
    </NavPendingProvider>
  );
}
