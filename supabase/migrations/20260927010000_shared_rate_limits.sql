-- Rate limits shared by every function instance. Written to be re-run safely.
--
-- The widget and chat limits lived in each function instance's memory, so on Vercel the real
-- ceiling was the cap times the number of warm instances. Buckets now live here and are charged in
-- one statement per request, under the bucket's row lock, so concurrent callers on any instance
-- see each other's hits and the cap holds exactly.
--
-- Each bucket keeps the times of the hits inside its window: a sliding window, as before, and a
-- short array because no cap is above a few hundred. The table is unlogged: it holds nothing that
-- must survive a crash, and a crash that empties it only forgives a minute of traffic.

create unlogged table if not exists public.rate_limits (
  bucket text primary key,
  hits timestamptz[] not null default '{}',
  -- When the newest hit leaves the window; after that the row counts for nothing.
  expires_at timestamptz not null
);

create index if not exists rate_limits_expires_at_idx on public.rate_limits (expires_at);

alter table public.rate_limits enable row level security;

-- No policies: only the service role and the functions below touch the table.
revoke all on public.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.rate_limits to service_role;

-- Charges one hit to each bucket in turn, narrowest first, and stops at the first that is full, so
-- a request one bucket refuses is not charged to the wider ones behind it. Returns whether every
-- bucket let the request through and, when one refused, how long until its oldest hit leaves the
-- window. The arrays are parallel: buckets[i] allows max_hits[i] hits per window_ms[i].
--
-- Callers always list buckets in the same order of kinds (visitor, address, assistant, owner), so
-- two requests never wait on each other's rows in opposite orders.
create or replace function public.take_rate_limits(
  buckets text[],
  max_hits integer[],
  window_ms integer[]
)
returns table (allowed boolean, retry_after_ms integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  i integer;
  span interval;
  moment timestamptz;
  kept timestamptz[];
begin
  if cardinality(buckets) is distinct from cardinality(max_hits)
    or cardinality(buckets) is distinct from cardinality(window_ms) then
    raise exception 'take_rate_limits: buckets, max_hits and window_ms differ in length'
      using errcode = '22023';
  end if;

  allowed := true;
  retry_after_ms := 0;

  for i in 1 .. coalesce(cardinality(buckets), 0) loop
    if buckets[i] is null or max_hits[i] is null or window_ms[i] is null or window_ms[i] <= 0 then
      raise exception 'take_rate_limits: bucket % needs a name, a cap and a positive window', i
        using errcode = '22023';
    end if;

    span := window_ms[i] * interval '1 millisecond';

    -- Lock the bucket's row, creating it on first use. The loop covers a row that another caller's
    -- cleanup deleted between the insert and the lock.
    loop
      select r.hits into kept
      from public.rate_limits r
      where r.bucket = buckets[i]
      for update;

      exit when found;

      insert into public.rate_limits (bucket, expires_at)
      values (buckets[i], clock_timestamp())
      on conflict (bucket) do nothing;
    end loop;

    -- Read the clock only once the lock is held, so the hits of one bucket stay in order.
    moment := clock_timestamp();
    kept := array(select hit from unnest(kept) as hit where hit > moment - span order by hit);

    if cardinality(kept) >= max_hits[i] then
      -- Nothing is written for a refusal: expired hits are dropped on the next allowed request.
      allowed := false;
      retry_after_ms := greatest(
        1,
        ceil(extract(epoch from (coalesce(kept[1], moment) + span - moment)) * 1000)::integer
      );
      exit;
    end if;

    update public.rate_limits r
    set hits = kept || moment,
        expires_at = moment + span
    where r.bucket = buckets[i];
  end loop;

  -- Remove a few buckets whose every hit has left the window, oldest first. A request creates at
  -- most one row per bucket it names and removes up to 32 expired ones, so idle buckets cannot pile
  -- up. Rows another caller holds are skipped, never waited on, so this cannot deadlock with a take.
  delete from public.rate_limits r
  where r.bucket in (
    select e.bucket
    from public.rate_limits e
    where e.expires_at < clock_timestamp()
    order by e.expires_at
    limit 32
    for update skip locked
  );

  return next;
end;
$$;

-- One bucket, for callers with a single limit.
create or replace function public.take_rate_limit(bucket text, max_hits integer, window_ms integer)
returns table (allowed boolean, retry_after_ms integer)
language sql
volatile
security definer
set search_path = ''
as $$
  select taken.allowed, taken.retry_after_ms
  from public.take_rate_limits(
    array[take_rate_limit.bucket],
    array[take_rate_limit.max_hits],
    array[take_rate_limit.window_ms]
  ) as taken;
$$;

revoke execute on function public.take_rate_limits(text[], integer[], integer[])
  from public, anon, authenticated;
revoke execute on function public.take_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.take_rate_limits(text[], integer[], integer[]) to service_role;
grant execute on function public.take_rate_limit(text, integer, integer) to service_role;
