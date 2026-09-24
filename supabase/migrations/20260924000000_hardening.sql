-- Hardening after the first audit.

-- 1. Metering belongs to the service role alone. The function is SECURITY DEFINER, and Postgres
--    grants EXECUTE to PUBLIC by default, so an anonymous caller could inflate any account's usage.
revoke execute on function public.increment_usage(uuid, public.usage_metric, integer)
  from public, anon, authenticated;

-- 2. A row that points at an assistant must point at one the caller owns. Checking owner_id alone
--    let a signed-in user attach sources and conversations to another account's assistant.
create or replace function public.owns_assistant(assistant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assistants a
    where a.id = assistant
      and a.owner_id = (select auth.uid())
  );
$$;

revoke execute on function public.owns_assistant(uuid) from public, anon;
grant execute on function public.owns_assistant(uuid) to authenticated, service_role;

drop policy "sources: owner" on public.sources;
create policy "sources: owner reads" on public.sources
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "sources: owner inserts" on public.sources
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.owns_assistant(assistant_id));
create policy "sources: owner updates" on public.sources
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.owns_assistant(assistant_id));
create policy "sources: owner deletes" on public.sources
  for delete to authenticated using (owner_id = (select auth.uid()));

drop policy "documents: owner" on public.documents;
create policy "documents: owner reads" on public.documents
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "documents: owner deletes" on public.documents
  for delete to authenticated using (owner_id = (select auth.uid()));

drop policy "conversations: owner" on public.conversations;
create policy "conversations: owner reads" on public.conversations
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "conversations: owner inserts" on public.conversations
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.owns_assistant(assistant_id));
create policy "conversations: owner updates" on public.conversations
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.owns_assistant(assistant_id));
create policy "conversations: owner deletes" on public.conversations
  for delete to authenticated using (owner_id = (select auth.uid()));

drop policy "leads: owner" on public.leads;
create policy "leads: owner reads" on public.leads
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "leads: owner updates" on public.leads
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.owns_assistant(assistant_id));
create policy "leads: owner deletes" on public.leads
  for delete to authenticated using (owner_id = (select auth.uid()));

-- 3. Trigger functions run as the caller. When Supabase Auth deletes a user, the cascade fires
--    them as a role that cannot touch our tables, so the deletion failed. They now run as owner.
create or replace function public.sync_source_document_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.source_id, old.source_id);
begin
  update public.sources
  set document_count = (select count(*) from public.documents where source_id = target)
  where id = target;

  return null;
end;
$$;

create or replace function public.sync_conversation_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set message_count = message_count + 1,
      unanswered_count = unanswered_count + (case when new.role = 'assistant' and new.answered = false then 1 else 0 end),
      last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;

  return null;
end;
$$;

-- 4. Copy: the default greeting carried an exclamation mark.
alter table public.assistants
  alter column welcome_message set default 'Ask me anything about the docs.';

update public.assistants
set welcome_message = 'Ask me anything about the docs.'
where welcome_message = 'Hi! Ask me anything about the docs.';

-- 5. Grouped questions show their most recent wording, not the alphabetically smallest one.
create or replace function public.top_questions(assistant uuid, since timestamptz, max_rows integer default 10)
returns table (question text, asks bigint, last_asked_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (array_agg(m.content order by m.created_at desc))[1] as question,
    count(*) as asks,
    max(m.created_at) as last_asked_at
  from public.messages m
  where m.assistant_id = assistant
    and m.role = 'user'
    and m.created_at >= since
  group by lower(regexp_replace(btrim(m.content), '\s+', ' ', 'g'))
  order by asks desc, last_asked_at desc
  limit least(greatest(max_rows, 1), 50);
$$;

create or replace function public.unanswered_questions(assistant uuid, since timestamptz, max_rows integer default 10)
returns table (question text, asks bigint, last_asked_at timestamptz, conversation_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (array_agg(q.content order by q.created_at desc))[1] as question,
    count(*) as asks,
    max(q.created_at) as last_asked_at,
    (array_agg(q.conversation_id order by q.created_at desc))[1] as conversation_id
  from public.messages a
  join lateral (
    select u.content, u.created_at, u.conversation_id
    from public.messages u
    where u.conversation_id = a.conversation_id
      and u.role = 'user'
      and u.created_at <= a.created_at
    order by u.created_at desc
    limit 1
  ) q on true
  where a.assistant_id = assistant
    and a.role = 'assistant'
    and a.answered = false
    and a.created_at >= since
  group by lower(regexp_replace(btrim(q.content), '\s+', ' ', 'g'))
  order by asks desc, last_asked_at desc
  limit least(greatest(max_rows, 1), 50);
$$;
