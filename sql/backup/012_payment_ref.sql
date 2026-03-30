-- Human-readable payment reference for customer support (e.g. PAY-A1B2C3D4).
-- Nullable for backward compatibility; unique when set (multiple NULLs allowed).

alter table public.payments
  add column if not exists payment_ref text;

create unique index if not exists idx_payments_payment_ref_unique
  on public.payments (payment_ref)
  where payment_ref is not null;

comment on column public.payments.payment_ref is 'Customer-visible ref (PAY-xxxxxxxx), unique when set';
