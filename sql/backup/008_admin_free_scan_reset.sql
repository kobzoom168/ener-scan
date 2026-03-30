-- Admin "Reset Free Trial": offset today's scan count so free tier behaves like a fresh 2 scans
-- without deleting scan_results (see paymentAccess.service.js).

alter table public.app_users
  add column if not exists free_scan_daily_offset integer not null default 0;

-- Local calendar day key (YYYY-MM-DD) matching server date logic in checkScanAccess.
alter table public.app_users
  add column if not exists free_scan_offset_date text;
