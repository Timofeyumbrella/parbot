-- One assistant per account. Written to be re-run safely.
--
-- An account used to own any number of assistants up to its plan's limit. It now owns exactly one,
-- created at onboarding. The app refuses a second; this index makes the database agree, so two
-- tabs submitting onboarding at once cannot both win.
--
-- An account that already has more than one is not tidied up here. Deleting an assistant deletes
-- its sources, indexed pages, conversations and leads, and which one an account keeps is not a call
-- a migration should make on its own. The migration stops instead, before changing anything, and
-- names each such account with the assistant it would most likely keep: the oldest.

do $$
declare
  duplicates text;
begin
  select string_agg(
           format(
             '%s (%s assistants; oldest %s "%s", created %s)',
             coalesce(profile.email, owners.owner_id::text),
             owners.total,
             oldest.id,
             oldest.name,
             oldest.created_at
           ),
           '; '
           order by owners.owner_id
         )
    into duplicates
    from (
      select owner_id, count(*) as total
        from public.assistants
       group by owner_id
      having count(*) > 1
    ) as owners
    left join public.profiles as profile on profile.id = owners.owner_id
    cross join lateral (
      select id, name, created_at
        from public.assistants
       where owner_id = owners.owner_id
       order by created_at, id
       limit 1
    ) as oldest;

  if duplicates is not null then
    raise exception 'Each account may now own one assistant, and these own more than one: %', duplicates
      using hint = 'Decide which assistant each account keeps (usually the oldest, named above), '
        || 'delete or move the others, then run this migration again. Nothing was changed.';
  end if;
end;
$$;

create unique index if not exists assistants_one_per_owner on public.assistants (owner_id);

-- The unique index answers every lookup by owner the plain one did.
drop index if exists public.assistants_owner_id_idx;
