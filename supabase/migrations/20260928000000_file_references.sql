-- References: the files and sources a reader points the in-app chat at, like @ in Claude. Written
-- to be re-run safely.
--
-- A question can carry references. The engine always reads the best passages of each referenced
-- source, whatever the question's wording, and the references stay with the conversation: a
-- follow-up that names none keeps using them, which is how "and what about limits?" knows where to
-- look. The widget never sends references; visitors cannot see an owner's private files.

-- 1. What each question was asked with, as the reader saw it ({id, title, kind} per source), so the
--    thread shows its chips after a reload even when a source is renamed or deleted later.
alter table public.messages
  add column if not exists source_references jsonb not null default '[]'::jsonb;

alter table public.messages drop constraint if exists messages_source_references_is_array;
alter table public.messages
  add constraint messages_source_references_is_array
  check (jsonb_typeof(source_references) = 'array');

-- 2. The conversation's active references. A question that sends a list replaces them; one that
--    sends none keeps them. A deleted source or conversation takes its rows with it.
create table if not exists public.conversation_references (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- The order the reader added them in, which is the order the chips show.
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (conversation_id, source_id)
);

create index if not exists conversation_references_source_idx
  on public.conversation_references (source_id);
create index if not exists conversation_references_assistant_idx
  on public.conversation_references (assistant_id);
create index if not exists conversation_references_owner_idx
  on public.conversation_references (owner_id);

alter table public.conversation_references enable row level security;

drop policy if exists "conversation references: owner reads" on public.conversation_references;
create policy "conversation references: owner reads" on public.conversation_references
  for select to authenticated using (owner_id = (select auth.uid()));

-- The conversation and the source must both belong to the assistant the row names, and the
-- assistant to the caller; otherwise a row could point one account's chat at another's file.
drop policy if exists "conversation references: owner inserts" on public.conversation_references;
create policy "conversation references: owner inserts" on public.conversation_references
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.owns_assistant(assistant_id)
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.assistant_id = conversation_references.assistant_id
    )
    and exists (
      select 1 from public.sources s
      where s.id = source_id and s.assistant_id = conversation_references.assistant_id
    )
  );

drop policy if exists "conversation references: owner deletes" on public.conversation_references;
create policy "conversation references: owner deletes" on public.conversation_references
  for delete to authenticated using (owner_id = (select auth.uid()));

-- New tables in public are granted to every API role by default; owners read, add and remove.
revoke all on public.conversation_references from anon, authenticated;
grant select, insert, delete on public.conversation_references to authenticated;
grant all on public.conversation_references to service_role;

-- 3. The best passages of each referenced source, with no similarity threshold: the reader said
--    where to look, so a question worded unlike the file ("what does this say about limits?")
--    still reads it. Rows come round robin, every source's best first, then every second best, so
--    a context budget that runs out keeps at least one passage from each file.
drop function if exists public.match_chunks_in_sources(uuid, extensions.vector, uuid[], integer);

create or replace function public.match_chunks_in_sources(
  assistant uuid,
  query_embedding extensions.vector(1536),
  source_ids uuid[],
  per_source integer default 4
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  document_url text,
  heading text,
  content text,
  similarity double precision,
  source_id uuid,
  source_rank integer
)
language sql
stable
security invoker
set search_path = extensions
as $$
  select
    ranked.chunk_id,
    ranked.document_id,
    ranked.document_title,
    ranked.document_url,
    ranked.heading,
    ranked.content,
    ranked.similarity,
    ranked.source_id,
    ranked.source_rank::integer
  from (
    select
      chunk.id as chunk_id,
      document.id as document_id,
      document.title as document_title,
      document.url as document_url,
      chunk.heading,
      chunk.content,
      1 - (chunk.embedding <=> query_embedding) as similarity,
      document.source_id,
      row_number() over (
        partition by document.source_id
        order by chunk.embedding <=> query_embedding, chunk.position
      ) as source_rank
    from public.chunks chunk
    join public.documents document on document.id = chunk.document_id
    where chunk.assistant_id = assistant
      and document.source_id = any(source_ids)
  ) ranked
  where ranked.source_rank <= least(greatest(per_source, 1), 10)
  order by ranked.source_rank, ranked.similarity desc;
$$;

revoke execute on function public.match_chunks_in_sources(uuid, extensions.vector, uuid[], integer)
  from public, anon;
grant execute on function public.match_chunks_in_sources(uuid, extensions.vector, uuid[], integer)
  to authenticated, service_role;
