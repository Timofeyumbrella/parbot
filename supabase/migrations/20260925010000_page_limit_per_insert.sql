-- The plan's page limit, enforced where documents are written.
--
-- A run used to read the account's document count once, at its start, and index up to the plan's
-- remaining pages. Two runs started together each saw the full allowance and, between them, wrote
-- more pages than the plan allows. The count is now checked in the same transaction as each insert,
-- under a per-account advisory lock, so runs that overlap share one allowance. A null result means
-- the limit is reached and nothing was written; the earlier copy of the page, if any, stays.
create or replace function public.insert_document_within_limit(
  page_limit integer,
  assistant uuid,
  owner uuid,
  source uuid,
  page_title text,
  page_content text,
  page_checksum text,
  page_token_count integer,
  page_url text default null,
  replaces uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
  inserted uuid;
begin
  perform pg_advisory_xact_lock(hashtext('documents:' || owner::text));

  select count(*)
  into used
  from public.documents
  where owner_id = owner
    and id is distinct from replaces;

  if used >= page_limit then
    return null;
  end if;

  if replaces is not null then
    delete from public.documents where id = replaces;
  end if;

  insert into public.documents (assistant_id, owner_id, source_id, url, title, content, checksum, token_count)
  values (assistant, owner, source, page_url, page_title, page_content, page_checksum, page_token_count)
  returning id into inserted;

  return inserted;
end;
$$;

revoke execute on function public.insert_document_within_limit(integer, uuid, uuid, uuid, text, text, text, integer, text, uuid)
  from public, anon, authenticated;
grant execute on function public.insert_document_within_limit(integer, uuid, uuid, uuid, text, text, text, integer, text, uuid)
  to service_role;
