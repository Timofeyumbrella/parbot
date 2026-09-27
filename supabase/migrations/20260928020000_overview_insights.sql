-- The Overview, rebuilt around what a docs owner acts on. Written to be re-run safely.
--
-- Every function runs as the caller (security invoker), so row level security decides what each
-- one sees: an owner reads their own assistant's rows and nothing else. They aggregate in the
-- database because the raw rows (every message of a month, every citation) are far larger than the
-- few numbers and lists the page shows.

-- Dropped first so a re-run can change a function's columns, which `create or replace` refuses.
drop function if exists public.overview_totals(uuid, timestamptz, timestamptz);
drop function if exists public.knowledge_gaps(uuid, timestamptz, integer);
drop function if exists public.disliked_answers(uuid, timestamptz, integer);
drop function if exists public.cited_documents(uuid, timestamptz, integer);
drop function if exists public.uncited_documents(uuid, timestamptz, integer);
drop function if exists public.cited_citations(uuid, timestamptz);
drop function if exists public.page_activity(uuid, timestamptz, integer);

-- 1. Answer quality for the period and for the period of the same length before it, one row each,
--    so the page can show the change. The answer rate counts answers the assistant finished:
--    `answered` true or false. A stopped answer (null) was cut short by the reader and says nothing
--    about the docs, so it is left out of the rate and of the time to answer.
create or replace function public.overview_totals(
  assistant uuid,
  since timestamptz,
  previous_since timestamptz
)
returns table (
  period text,
  questions bigint,
  answered bigint,
  unanswered bigint,
  positive bigint,
  negative bigint,
  median_latency_ms integer,
  leads bigint,
  new_leads bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.period,
    coalesce(m.questions, 0),
    coalesce(m.answered, 0),
    coalesce(m.unanswered, 0),
    coalesce(m.positive, 0),
    coalesce(m.negative, 0),
    m.median_latency_ms,
    coalesce(l.leads, 0),
    coalesce(l.new_leads, 0)
  from (
    values
      ('current'::text, since, 'infinity'::timestamptz),
      ('previous'::text, previous_since, since)
  ) as p (period, starts, ends)
  left join lateral (
    select
      count(*) filter (where x.role = 'user') as questions,
      count(*) filter (where x.role = 'assistant' and x.answered = true) as answered,
      count(*) filter (where x.role = 'assistant' and x.answered = false) as unanswered,
      count(*) filter (where x.role = 'assistant' and x.feedback = 1) as positive,
      count(*) filter (where x.role = 'assistant' and x.feedback = -1) as negative,
      (percentile_cont(0.5) within group (order by x.latency_ms)
        filter (where x.role = 'assistant' and x.answered is not null and x.latency_ms is not null)
      )::integer as median_latency_ms
    from public.messages x
    where x.assistant_id = assistant
      and x.created_at >= p.starts
      and x.created_at < p.ends
  ) m on true
  left join lateral (
    select count(*) as leads, count(*) filter (where y.status = 'new') as new_leads
    from public.leads y
    where y.assistant_id = assistant
      and y.created_at >= p.starts
      and y.created_at < p.ends
  ) l on true
  order by p.period;
$$;

-- 2. Knowledge gaps: the questions behind unanswered answers, one row per wording. Wordings are
--    compared case-, space- and end-punctuation-insensitively here; the page merges wordings that
--    are close but not equal ("Is there a Slack integration?" and "Do you have a Slack
--    integration") with a trigram comparison of their content words, which pg_trgm cannot do
--    without also counting "is", "there" and "a".
create or replace function public.knowledge_gaps(
  assistant uuid,
  since timestamptz,
  max_rows integer default 200
)
returns table (
  question text,
  asks bigint,
  last_asked_at timestamptz,
  conversation_id uuid
)
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
  group by regexp_replace(
    lower(regexp_replace(btrim(q.content), '\s+', ' ', 'g')),
    '[[:space:][:punct:]]+$',
    ''
  )
  order by asks desc, last_asked_at desc
  limit least(greatest(max_rows, 1), 500);
$$;

-- 3. Answers readers rated thumbs down, newest first, with the question each one answered. The
--    total is counted before the limit, so the page can say how many there are beyond the list.
create or replace function public.disliked_answers(
  assistant uuid,
  since timestamptz,
  max_rows integer default 5
)
returns table (
  message_id uuid,
  conversation_id uuid,
  answered_at timestamptz,
  question text,
  answer text,
  total bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.id,
    a.conversation_id,
    a.created_at,
    q.content,
    left(a.content, 600),
    count(*) over ()
  from public.messages a
  left join lateral (
    select u.content
    from public.messages u
    where u.conversation_id = a.conversation_id
      and u.role = 'user'
      and u.created_at <= a.created_at
    order by u.created_at desc
    limit 1
  ) q on true
  where a.assistant_id = assistant
    and a.role = 'assistant'
    and a.feedback = -1
    and a.created_at >= since
  order by a.created_at desc
  limit least(greatest(max_rows, 1), 50);
$$;

-- 4. Content that works: every citation in the period's answers, resolved to the document it names.
--    Re-indexing a changed page writes a new document, so a citation made before that points at an
--    id that is gone; it is matched to the current document by its address (or, for an upload or
--    pasted text, which has none, by its title) so a re-indexed page keeps its history.
create or replace function public.cited_citations(assistant uuid, since timestamptz)
returns table (message_id uuid, document_id uuid, title text, url text)
language sql
stable
security invoker
set search_path = ''
as $$
  with cites as (
    select
      m.id as message_id,
      -- A case, not a condition in the join: Postgres may evaluate a join's conditions in any
      -- order, and a cast of something that is not a uuid would fail the whole query.
      case
        when c.value ->> 'documentId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (c.value ->> 'documentId')::uuid
      end as cited_id,
      nullif(c.value ->> 'url', '') as url,
      coalesce(nullif(c.value ->> 'title', ''), 'Untitled page') as title
    from public.messages m
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(m.citations) = 'array' then m.citations else '[]'::jsonb end
    ) c
    where m.assistant_id = assistant
      and m.role = 'assistant'
      and m.created_at >= since
      and jsonb_typeof(c.value) = 'object'
  )
  select
    cites.message_id,
    coalesce(by_id.id, by_address.id),
    cites.title,
    cites.url
  from cites
  left join public.documents by_id
    on by_id.id = cites.cited_id
   and by_id.assistant_id = assistant
  left join lateral (
    select d.id
    from public.documents d
    where by_id.id is null
      and d.assistant_id = assistant
      and (
        (cites.url is not null and d.url = cites.url)
        or (cites.url is null and d.url is null and d.title = cites.title)
      )
    order by d.created_at desc
    limit 1
  ) by_address on true;
$$;

create or replace function public.cited_documents(
  assistant uuid,
  since timestamptz,
  max_rows integer default 5
)
returns table (
  document_id uuid,
  title text,
  url text,
  source_title text,
  source_kind public.source_kind,
  answers bigint,
  total bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with resolved as (
    select * from public.cited_citations(assistant, since)
  ),
  grouped as (
    select
      r.document_id,
      coalesce(r.document_id::text, 'url:' || r.url, 'title:' || r.title) as key,
      (array_agg(r.title))[1] as cited_title,
      (array_agg(r.url))[1] as cited_url,
      -- An answer that cites three passages of one page used that page once.
      count(distinct r.message_id) as answers
    from resolved r
    group by 1, 2
  )
  select
    g.document_id,
    coalesce(d.title, g.cited_title),
    coalesce(d.url, g.cited_url),
    s.title,
    s.kind,
    g.answers,
    count(*) over ()
  from grouped g
  left join public.documents d on d.id = g.document_id
  left join public.sources s on s.id = d.source_id
  order by g.answers desc, coalesce(d.title, g.cited_title)
  limit least(greatest(max_rows, 1), 50);
$$;

-- Content that does not work: indexed pages no answer in the period cited. `total` is how many
-- there are, counted before the limit.
create or replace function public.uncited_documents(
  assistant uuid,
  since timestamptz,
  max_rows integer default 5
)
returns table (
  document_id uuid,
  title text,
  url text,
  source_title text,
  source_kind public.source_kind,
  created_at timestamptz,
  total bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with cited as (
    select distinct r.document_id
    from public.cited_citations(assistant, since) r
    where r.document_id is not null
  )
  select
    d.id,
    d.title,
    d.url,
    s.title,
    s.kind,
    d.created_at,
    count(*) over ()
  from public.documents d
  join public.sources s on s.id = d.source_id
  where d.assistant_id = assistant
    and not exists (select 1 from cited where cited.document_id = d.id)
  -- The oldest first: a page added yesterday has not had its chance yet.
  order by d.created_at asc, d.title
  limit least(greatest(max_rows, 1), 50);
$$;

-- 5. Where readers ask: widget questions grouped by the page their conversation started on, by
--    host and path (query and fragment dropped, a trailing slash ignored), with the answer rate
--    on that page.
create or replace function public.page_activity(
  assistant uuid,
  since timestamptz,
  max_rows integer default 6
)
returns table (
  host text,
  path text,
  page_url text,
  questions bigint,
  answered bigint,
  unanswered bigint,
  last_asked_at timestamptz,
  total bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with pages as (
    select
      c.id,
      c.page_url,
      coalesce(substring(c.page_url from '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#]*)'), '') as host,
      coalesce(
        nullif(
          regexp_replace(
            coalesce(substring(c.page_url from '^[A-Za-z][A-Za-z0-9+.-]*://[^/?#]*([^?#]*)'), ''),
            '(.)/+$',
            '\1'
          ),
          ''
        ),
        '/'
      ) as path
    from public.conversations c
    where c.assistant_id = assistant
      and c.page_url is not null
      and c.page_url <> ''
  )
  select
    p.host,
    p.path,
    (array_agg(p.page_url order by m.created_at desc))[1],
    count(*) filter (where m.role = 'user'),
    count(*) filter (where m.role = 'assistant' and m.answered = true),
    count(*) filter (where m.role = 'assistant' and m.answered = false),
    max(m.created_at) filter (where m.role = 'user'),
    count(*) over ()
  from pages p
  join public.messages m on m.conversation_id = p.id
  where m.created_at >= since
  group by p.host, p.path
  having count(*) filter (where m.role = 'user') > 0
  order by 4 desc, 7 desc
  limit least(greatest(max_rows, 1), 50);
$$;

-- Citations of a re-indexed page are matched to its current copy by address.
create index if not exists documents_assistant_url_idx on public.documents (assistant_id, url);

-- Widget conversations of one assistant that carry a page, for the query above.
create index if not exists conversations_assistant_page_idx
  on public.conversations (assistant_id)
  where page_url is not null;

-- Only signed-in owners (and the service role) run these; Postgres grants EXECUTE to PUBLIC.
revoke execute on function public.overview_totals(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.knowledge_gaps(uuid, timestamptz, integer) from public, anon;
revoke execute on function public.disliked_answers(uuid, timestamptz, integer) from public, anon;
revoke execute on function public.cited_citations(uuid, timestamptz) from public, anon;
revoke execute on function public.cited_documents(uuid, timestamptz, integer) from public, anon;
revoke execute on function public.uncited_documents(uuid, timestamptz, integer) from public, anon;
revoke execute on function public.page_activity(uuid, timestamptz, integer) from public, anon;

grant execute on function public.overview_totals(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.knowledge_gaps(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.disliked_answers(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.cited_citations(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.cited_documents(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.uncited_documents(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.page_activity(uuid, timestamptz, integer) to authenticated, service_role;
