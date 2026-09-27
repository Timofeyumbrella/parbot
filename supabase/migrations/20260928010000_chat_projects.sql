-- Projects: folders in the chat sidebar, like projects in ChatGPT. Written to be re-run safely.
--
-- A project groups in-app conversations and carries its own files and instructions. Every question
-- asked in one of its conversations reads the project's files (through the same referenced-source
-- retrieval as @ references) and follows its instructions. Moving a conversation in or out changes
-- that context from the next question on. Deleting a project keeps its conversations: they move
-- out of it. The widget never belongs to a project.

-- 1. The projects.
create table if not exists public.chat_projects (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_projects_name_length check (name = btrim(name) and char_length(name) between 1 and 60),
  constraint chat_projects_instructions_length check (char_length(instructions) <= 4000),
  -- Lets a conversation name its project together with its assistant (see the foreign key below).
  constraint chat_projects_id_assistant_key unique (id, assistant_id)
);

-- One name per assistant, whatever the case, so two folders never look alike in the sidebar.
create unique index if not exists chat_projects_assistant_name_key
  on public.chat_projects (assistant_id, lower(name));
create index if not exists chat_projects_owner_idx on public.chat_projects (owner_id);

drop trigger if exists chat_projects_set_updated_at on public.chat_projects;
create trigger chat_projects_set_updated_at
  before update on public.chat_projects
  for each row execute function public.set_updated_at();

alter table public.chat_projects enable row level security;

drop policy if exists "chat projects: owner reads" on public.chat_projects;
create policy "chat projects: owner reads" on public.chat_projects
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "chat projects: owner inserts" on public.chat_projects;
create policy "chat projects: owner inserts" on public.chat_projects
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.owns_assistant(assistant_id));

drop policy if exists "chat projects: owner updates" on public.chat_projects;
create policy "chat projects: owner updates" on public.chat_projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.owns_assistant(assistant_id));

drop policy if exists "chat projects: owner deletes" on public.chat_projects;
create policy "chat projects: owner deletes" on public.chat_projects
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.chat_projects from anon, authenticated;
grant select, insert, update, delete on public.chat_projects to authenticated;
grant all on public.chat_projects to service_role;

-- 2. The project's files: sources of the same assistant, in the order they were added. A deleted
--    source or project takes its rows with it.
create table if not exists public.project_sources (
  project_id uuid not null references public.chat_projects (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (project_id, source_id)
);

create index if not exists project_sources_source_idx on public.project_sources (source_id);
create index if not exists project_sources_owner_idx on public.project_sources (owner_id);

alter table public.project_sources enable row level security;

drop policy if exists "project sources: owner reads" on public.project_sources;
create policy "project sources: owner reads" on public.project_sources
  for select to authenticated using (owner_id = (select auth.uid()));

-- The project and the source must belong to one assistant, and that assistant to the caller;
-- otherwise a row could put one account's file into another account's project.
drop policy if exists "project sources: owner inserts" on public.project_sources;
create policy "project sources: owner inserts" on public.project_sources
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.chat_projects p
      join public.sources s on s.assistant_id = p.assistant_id
      where p.id = project_sources.project_id
        and s.id = project_sources.source_id
        and public.owns_assistant(p.assistant_id)
    )
  );

drop policy if exists "project sources: owner updates" on public.project_sources;
create policy "project sources: owner updates" on public.project_sources
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.chat_projects p
      join public.sources s on s.assistant_id = p.assistant_id
      where p.id = project_sources.project_id
        and s.id = project_sources.source_id
        and public.owns_assistant(p.assistant_id)
    )
  );

drop policy if exists "project sources: owner deletes" on public.project_sources;
create policy "project sources: owner deletes" on public.project_sources
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.project_sources from anon, authenticated;
grant select, insert, update, delete on public.project_sources to authenticated;
grant all on public.project_sources to service_role;

-- 3. The project a conversation belongs to. The key names the project together with the
--    conversation's assistant, so a conversation can only join a project of its own assistant,
--    whoever writes it (row level security does not apply to a foreign key lookup). Deleting the
--    project clears only project_id: the conversation stays, outside any project.
alter table public.conversations add column if not exists project_id uuid;

alter table public.conversations drop constraint if exists conversations_project_fkey;
alter table public.conversations
  add constraint conversations_project_fkey
  foreign key (project_id, assistant_id)
  references public.chat_projects (id, assistant_id)
  on delete set null (project_id);

alter table public.conversations drop constraint if exists conversations_project_in_app_only;
alter table public.conversations
  add constraint conversations_project_in_app_only
  check (project_id is null or channel = 'app');

create index if not exists conversations_project_idx
  on public.conversations (project_id, last_message_at desc nulls last)
  where project_id is not null;

-- 4. Another tab sees a project created, renamed or edited. Editing a project's files touches
--    its row, so one table carries every change.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_projects'
  ) then
    alter publication supabase_realtime add table public.chat_projects;
  end if;
end
$$;
