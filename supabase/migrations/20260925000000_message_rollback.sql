-- Rollbacks and reservations, after the second audit. Written to be re-run safely.

-- 1. The engine deletes the reader's message when an exchange fails before any text arrived. The
--    counters on the conversation only ever moved up, so the Inbox and the chat list counted
--    messages that no longer existed. A delete now moves them back down. When the whole
--    conversation is deleted the update finds no row, so cascades cost one indexed lookup each.
create or replace function public.sync_conversation_activity_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set message_count = greatest(message_count - 1, 0),
      unanswered_count = greatest(
        unanswered_count - (case when old.role = 'assistant' and old.answered = false then 1 else 0 end),
        0
      ),
      last_message_at = (
        select max(m.created_at) from public.messages m where m.conversation_id = old.conversation_id
      ),
      updated_at = now()
  where id = old.conversation_id;

  return null;
end;
$$;

drop trigger if exists messages_sync_conversation_activity_on_delete on public.messages;

create trigger messages_sync_conversation_activity_on_delete
after delete on public.messages
for each row execute function public.sync_conversation_activity_on_delete();

-- 2. Metering was a read, a check and an increment after the answer, so requests in flight
--    together all passed at one below the limit. reserve_message takes a slot in one statement
--    (the conflicting row is locked, so concurrent callers see each other's increments) and says
--    whether there was one; release_message gives it back when no answer was saved.
--    increment_usage stays for the other metrics and for callers that meter after the fact.
create or replace function public.reserve_message(owner uuid, max_allowed integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  reserved boolean;
begin
  if max_allowed <= 0 then
    return false;
  end if;

  insert into public.usage_counters as counters (owner_id, metric, period_start, value)
  values (owner, 'messages', date_trunc('month', now())::date, 1)
  on conflict (owner_id, metric, period_start)
  do update set value = counters.value + 1, updated_at = now()
  where counters.value < max_allowed
  returning true into reserved;

  return coalesce(reserved, false);
end;
$$;

create or replace function public.release_message(owner uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.usage_counters
  set value = greatest(value - 1, 0), updated_at = now()
  where owner_id = owner
    and metric = 'messages'
    and period_start = date_trunc('month', now())::date;
$$;

revoke execute on function public.reserve_message(uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_message(uuid) from public, anon, authenticated;
grant execute on function public.reserve_message(uuid, integer) to service_role;
grant execute on function public.release_message(uuid) to service_role;
