-- Add GB Prime Pay provider mapping fields for idempotent webhook handling

alter table public.payments
  add column if not exists provider_reference_no text null,
  add column if not exists qr_base64 text null;

create index if not exists idx_payments_provider_payment_id
  on public.payments(provider_payment_id);

create index if not exists idx_payments_provider_reference_no
  on public.payments(provider_reference_no);

