import { redirect } from 'next/navigation';

import { getAccountAssistant } from '@/lib/assistants';
import { requireUser } from '@/lib/session';

/**
 * Where signing in and the account-level links land. An account has one assistant, so this is
 * not a screen of its own: it opens the assistant's Overview, or onboarding when there is none yet.
 */
export default async function DashboardPage() {
  await requireUser();

  const assistant = await getAccountAssistant();

  redirect(assistant ? `/a/${assistant.id}` : '/onboarding');
}
