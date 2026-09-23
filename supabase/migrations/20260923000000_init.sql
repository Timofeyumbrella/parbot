-- Parbot schema. One account owns many assistants; every tenant table carries owner_id and
-- row level security compares it with auth.uid(). Widget traffic is anonymous and goes through
-- the service role, gated in application code by the assistant's public key and origin list.

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.plan_id as enum ('hobby', 'starter', 'growth');
create type public.subscription_status as enum ('active', 'trialing', 'past_due', 'canceled', 'incomplete');
create type public.billing_interval as enum ('monthly', 'yearly');
create type public.source_kind as enum ('url', 'sitemap', 'upload', 'text');
create type public.source_status as enum ('queued', 'crawling', 'indexing', 'ready', 'failed');
create type public.chat_channel as enum ('app', 'widget');
create type public.message_role as enum ('user', 'assistant');
create type public.lead_status as enum ('new', 'contacted', 'closed');
create type public.usage_metric as enum ('messages');

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  account_id uuid primary key references public.profiles (id) on delete cascade,
  plan_id public.plan_id not null default 'hobby',
  status public.subscription_status not null default 'active',
  billing_interval public.billing_interval,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_paid_requires_interval check (plan_id = 'hobby' or billing_interval is not null)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;

  insert into public.subscriptions (account_id)
  values (new.id)
  on conflict (account_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Assistants and knowledge
-- ---------------------------------------------------------------------------

create table public.assistants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 48),
  public_key text not null unique default ('pb_' || replace(gen_random_uuid()::text, '-', '')),
  description text,
  instructions text,
  welcome_message text not null default 'Hi! Ask me anything about the docs.',
  suggested_questions text[] not null default '{}',
  mode text not null default 'bubble' check (mode in ('bubble', 'palette')),
  theme jsonb not null default '{"scheme": "auto", "accent": "#f59e0b", "position": "right", "radius": "md"}'::jsonb,
  allowed_origins text[] not null default '{}',
  hide_branding boolean not null default false,
  lead_capture boolean not null default false,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create index assistants_owner_id_idx on public.assistants (owner_id);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind public.source_kind not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  uri text,
  storage_path text,
  mime_type text,
  byte_size bigint check (byte_size >= 0),
  status public.source_status not null default 'queued',
  error text,
  pages_found integer not null default 0 check (pages_found >= 0),
  pages_done integer not null default 0 check (pages_done >= 0),
  document_count integer not null default 0 check (document_count >= 0),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  last_indexed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_remote_requires_uri check (kind not in ('url', 'sitemap') or uri is not null),
  constraint sources_stored_requires_path check (kind not in ('upload', 'text') or storage_path is not null)
);

create index sources_assistant_id_idx on public.sources (assistant_id, created_at desc);
create index sources_owner_id_idx on public.sources (owner_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  url text,
  title text not null,
  content text not null,
  checksum text not null,
  token_count integer not null default 0 check (token_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_source_id_idx on public.documents (source_id);
create index documents_assistant_id_idx on public.documents (assistant_id);
create index documents_owner_id_idx on public.documents (owner_id);

create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  position integer not null check (position >= 0),
  heading text,
  content text not null,
  token_count integer not null default 0 check (token_count >= 0),
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (document_id, position)
);

create index chunks_assistant_id_idx on public.chunks (assistant_id);
create index chunks_owner_id_idx on public.chunks (owner_id);
create index chunks_embedding_idx on public.chunks using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.sync_source_document_count()
returns trigger
language plpgsql
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

create trigger documents_sync_source_document_count
after insert or delete on public.documents
for each row execute function public.sync_source_document_count();

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  channel public.chat_channel not null default 'app',
  visitor_id text,
  title text,
  page_url text,
  message_count integer not null default 0 check (message_count >= 0),
  unanswered_count integer not null default 0 check (unanswered_count >= 0),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_widget_requires_visitor check (channel <> 'widget' or visitor_id is not null)
);

create index conversations_assistant_channel_idx
  on public.conversations (assistant_id, channel, last_message_at desc nulls last);
create index conversations_owner_id_idx on public.conversations (owner_id);
create index conversations_visitor_idx on public.conversations (assistant_id, visitor_id) where visitor_id is not null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  role public.message_role not null,
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  answered boolean,
  feedback smallint check (feedback in (-1, 1)),
  model text,
  latency_ms integer check (latency_ms >= 0),
  prompt_tokens integer check (prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens >= 0),
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index messages_assistant_created_idx on public.messages (assistant_id, created_at desc);
create index messages_owner_id_idx on public.messages (owner_id);

create or replace function public.sync_conversation_activity()
returns trigger
language plpgsql
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

create trigger messages_sync_conversation_activity
after insert on public.messages
for each row execute function public.sync_conversation_activity();

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note text,
  page_url text,
  status public.lead_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_assistant_status_idx on public.leads (assistant_id, status, created_at desc);
create index leads_owner_id_idx on public.leads (owner_id);

-- ---------------------------------------------------------------------------
-- Usage
-- ---------------------------------------------------------------------------

create table public.usage_counters (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  metric public.usage_metric not null,
  period_start date not null,
  value bigint not null default 0 check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, metric, period_start)
);

create or replace function public.increment_usage(owner uuid, usage public.usage_metric, delta integer default 1)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.usage_counters (owner_id, metric, period_start, value)
  values (owner, usage, date_trunc('month', now())::date, greatest(delta, 0))
  on conflict (owner_id, metric, period_start)
  do update set value = usage_counters.value + excluded.value, updated_at = now()
  returning value;
$$;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger assistants_set_updated_at before update on public.assistants for each row execute function public.set_updated_at();
create trigger sources_set_updated_at before update on public.sources for each row execute function public.set_updated_at();
create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();
create trigger conversations_set_updated_at before update on public.conversations for each row execute function public.set_updated_at();
create trigger leads_set_updated_at before update on public.leads for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Retrieval and analytics functions
-- ---------------------------------------------------------------------------

create or replace function public.match_chunks(
  assistant uuid,
  query_embedding extensions.vector(1536),
  match_count integer default 8,
  similarity_threshold double precision default 0.3
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  document_url text,
  heading text,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = extensions
as $$
  select
    chunk.id,
    document.id,
    document.title,
    document.url,
    chunk.heading,
    chunk.content,
    1 - (chunk.embedding <=> query_embedding) as similarity
  from public.chunks chunk
  join public.documents document on document.id = chunk.document_id
  where chunk.assistant_id = assistant
    and 1 - (chunk.embedding <=> query_embedding) >= similarity_threshold
  order by chunk.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 40);
$$;

create or replace function public.assistant_stats(assistant uuid, since timestamptz)
returns table (
  conversations bigint,
  questions bigint,
  answered bigint,
  unanswered bigint,
  leads bigint,
  positive bigint,
  negative bigint,
  median_latency_ms integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*) from public.conversations c where c.assistant_id = assistant and c.created_at >= since) as conversations,
    count(*) filter (where m.role = 'user') as questions,
    count(*) filter (where m.role = 'assistant' and m.answered = true) as answered,
    count(*) filter (where m.role = 'assistant' and m.answered = false) as unanswered,
    (select count(*) from public.leads l where l.assistant_id = assistant and l.created_at >= since) as leads,
    count(*) filter (where m.role = 'assistant' and m.feedback = 1) as positive,
    count(*) filter (where m.role = 'assistant' and m.feedback = -1) as negative,
    (percentile_cont(0.5) within group (order by m.latency_ms)
      filter (where m.role = 'assistant' and m.latency_ms is not null))::integer as median_latency_ms
  from public.messages m
  where m.assistant_id = assistant
    and m.created_at >= since;
$$;

create or replace function public.assistant_daily(assistant uuid, since timestamptz)
returns table (day date, questions bigint, answered bigint, unanswered bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (m.created_at at time zone 'UTC')::date as day,
    count(*) filter (where m.role = 'user') as questions,
    count(*) filter (where m.role = 'assistant' and m.answered = true) as answered,
    count(*) filter (where m.role = 'assistant' and m.answered = false) as unanswered
  from public.messages m
  where m.assistant_id = assistant
    and m.created_at >= since
  group by 1
  order by 1;
$$;

create or replace function public.top_questions(assistant uuid, since timestamptz, max_rows integer default 10)
returns table (question text, asks bigint, last_asked_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    min(m.content) as question,
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
    min(q.content) as question,
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

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.assistants enable row level security;
alter table public.sources enable row level security;
alter table public.documents enable row level security;
alter table public.chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.leads enable row level security;
alter table public.usage_counters enable row level security;

create policy "profiles: own row" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own row" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "subscriptions: own row" on public.subscriptions
  for select to authenticated using (account_id = (select auth.uid()));

create policy "assistants: owner" on public.assistants
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "sources: owner" on public.sources
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "documents: owner" on public.documents
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "chunks: owner reads" on public.chunks
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "conversations: owner" on public.conversations
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "messages: owner reads" on public.messages
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "messages: owner updates" on public.messages
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "leads: owner" on public.leads
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "usage: owner reads" on public.usage_counters
  for select to authenticated using (owner_id = (select auth.uid()));

revoke all on all tables in schema public from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.assistants to authenticated;
grant select, insert, update, delete on public.sources to authenticated;
grant select, delete on public.documents to authenticated;
grant select on public.chunks to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant update (feedback) on public.messages to authenticated;
grant select, update, delete on public.leads to authenticated;
grant select on public.usage_counters to authenticated;

grant all on all tables in schema public to service_role;

grant execute on function public.match_chunks(uuid, extensions.vector, integer, double precision) to authenticated, service_role;
grant execute on function public.assistant_stats(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.assistant_daily(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.top_questions(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.unanswered_questions(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.increment_usage(uuid, public.usage_metric, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Realtime: the dashboard subscribes to these with the visitor's own session,
-- so row level security still decides what each subscriber receives.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.sources;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.leads;

-- ---------------------------------------------------------------------------
-- Storage: uploads live under <owner_id>/<assistant_id>/<file>
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sources',
  'sources',
  false,
  26214400,
  array[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/html',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

create policy "source files: owner reads"
  on storage.objects for select to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "source files: owner uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "source files: owner deletes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text);
