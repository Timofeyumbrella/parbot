import { AppSidebar } from '@/components/app-sidebar';
import { listAssistants } from '@/lib/assistants';
import { planFor } from '@/lib/plans';
import { requireUser } from '@/lib/session';

export default async function DashboardLayout({ children }: LayoutProps<'/'>) {
  const { supabase, user } = await requireUser();
  const [assistants, { data: subscription }] = await Promise.all([
    listAssistants(),
    supabase.from('subscriptions').select('plan_id').eq('account_id', user.id).maybeSingle(),
  ]);

  return (
    <div className="flex min-h-svh w-full">
      <AppSidebar
        assistants={assistants}
        email={user.email ?? ''}
        planName={planFor(subscription?.plan_id).name}
      />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
