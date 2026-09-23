import { cache } from 'react';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Resolved once per request, however many layouts and pages ask. */
export const getSession = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
});

export const requireUser = async () => {
  const session = await getSession();

  if (!session.user) {
    redirect('/login');
  }

  return { supabase: session.supabase, user: session.user };
};
