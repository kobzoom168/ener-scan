create extension if not exists "pgcrypto";

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  scan_request_id uuid null references public.scan_requests(id) on delete set null,
  provider text not null default 'promptpay_manual',
  amount integer not null default 0,
  currency text not null default 'THB',
  status text not null default 'pending',
  slip_image_url text,
  provider_payment_id text,
  paid_at timestamptz null,
  unlock_hours integer not null default 24,
  unlocked_until timestamptz null,
  verified_by text null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_user_id_created_at
  on public.payments(user_id, created_at desc);
create index if not exists idx_payments_status
  on public.payments(status);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_payments_set_updated_at on public.payments;
create trigger trg_payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();
