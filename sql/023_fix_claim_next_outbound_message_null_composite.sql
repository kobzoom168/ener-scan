-- Fix: claim_next_outbound_message must return SQL NULL when no row is claimed.
-- When UPDATE affects 0 rows, RETURNING ... INTO r assigns a composite with all-null
-- fields; IF NOT FOUND is not reliable here. Use ROW_COUNT instead.
-- Apply on existing DBs that already ran 022.

create or replace function public.claim_next_outbound_message(p_worker_id text)
returns public.outbound_messages
language plpgsql
as $$
declare
  r public.outbound_messages;
  updated_count int;
begin
  update public.outbound_messages m
  set
    status = 'sending',
    attempt_count = m.attempt_count + 1,
    updated_at = now()
  from (
    select id
    from public.outbound_messages
    where status in ('queued', 'retry_wait')
      and (next_retry_at is null or next_retry_at <= now())
    order by priority asc, created_at asc
    limit 1
    for update skip locked
  ) picked
  where m.id = picked.id
  returning m.* into r;

  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    return null;
  end if;
  return r;
end;
$$;
