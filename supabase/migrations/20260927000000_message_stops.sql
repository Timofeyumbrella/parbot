-- Stop as an explicit request. Written to be re-run safely.
--
-- On a serverless host the reader's disconnect never reaches the function that streams the
-- answer: the request's signal is not aborted and the stream is not cancelled, so the engine went
-- on to save and meter the whole answer after the reader pressed Stop. The client now records the
-- stop here, keyed by the id the answer is saved under (the client proposes it with the question,
-- so a stop can be recorded before the stream has said anything). The engine looks for the row
-- while it streams and once more before and after it saves; the stop routes fix up an answer that
-- was saved before the row arrived.

-- 1. One row per stopped answer. There is no foreign key to the conversation or the message:
--    the stop may land before either exists. The engine only honours a row whose conversation and
--    assistant match its own, and rows go with their assistant, their owner or their conversation.
create table if not exists public.message_stops (
  message_id uuid primary key,
  conversation_id uuid not null,
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- What the reader had been shown when they stopped, as the client rendered it.
  content text not null default '' check (char_length(content) <= 20000),
  created_at timestamptz not null default now()
);

create index if not exists message_stops_conversation_idx on public.message_stops (conversation_id);
create index if not exists message_stops_assistant_idx on public.message_stops (assistant_id);
create index if not exists message_stops_owner_idx on public.message_stops (owner_id);

alter table public.message_stops enable row level security;

drop policy if exists "message stops: owner reads" on public.message_stops;
create policy "message stops: owner reads" on public.message_stops
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "message stops: owner inserts" on public.message_stops;
create policy "message stops: owner inserts" on public.message_stops
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.owns_assistant(assistant_id));

-- New tables in public are granted to every API role by default; owners only read and insert.
revoke all on public.message_stops from anon, authenticated;
grant select, insert on public.message_stops to authenticated;
grant all on public.message_stops to service_role;

-- A deleted conversation takes its stops with it.
create or replace function public.delete_conversation_stops()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.message_stops where conversation_id = old.id;

  return null;
end;
$$;

drop trigger if exists conversations_delete_stops on public.conversations;

create trigger conversations_delete_stops
after delete on public.conversations
for each row execute function public.delete_conversation_stops();

-- 2. A stop that lands after the answer was saved turns the saved answer into a stopped one
--    (answered becomes null). The counters only moved on insert and delete, so an unanswered reply
--    that was stopped would stay counted as unanswered. An update of `answered` moves them now.
create or replace function public.sync_conversation_unanswered_on_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'assistant' and old.answered is distinct from new.answered then
    update public.conversations
    set unanswered_count = greatest(
          unanswered_count
            + (case when new.answered = false then 1 else 0 end)
            - (case when old.answered = false then 1 else 0 end),
          0
        ),
        updated_at = now()
    where id = new.conversation_id;
  end if;

  return null;
end;
$$;

drop trigger if exists messages_sync_unanswered_on_update on public.messages;

create trigger messages_sync_unanswered_on_update
after update of answered on public.messages
for each row execute function public.sync_conversation_unanswered_on_update();
