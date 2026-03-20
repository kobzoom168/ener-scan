-- Payment slip verify (awaiting_payment -> pending_verify -> paid/rejected)
-- Extends existing public.payments table to support admin approval workflow.

alter table public.payments
  add column if not exists line_user_id text;

alter table public.payments
  add column if not exists package_code text;

alter table public.payments
  add column if not exists package_name text;

alter table public.payments
  add column if not exists expected_amount integer;

-- Storage location for the slip image (public URL or signed URL).
alter table public.payments
  add column if not exists slip_url text;

-- LINE message id for trace/debugging.
alter table public.payments
  add column if not exists slip_message_id text;

alter table public.payments
  add column if not exists verified_at timestamptz;

alter table public.payments
  add column if not exists rejected_at timestamptz;

alter table public.payments
  add column if not exists reject_reason text;

alter table public.payments
  add column if not exists approved_by text;

-- Helpful indexes for admin listing.
create index if not exists idx_payments_status
  on public.payments(status);

create index if not exists idx_payments_line_user_id_created_at
  on public.payments(line_user_id, created_at desc);

