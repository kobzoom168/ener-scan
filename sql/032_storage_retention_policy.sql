-- Ener Scan: storage retention policy (additive, safe to re-run).
-- Groups: (1) original LINE ingest in scan_uploads, (2) thumbnail_path on same row,
-- (3) payment slip files + payment_slips metadata, (4) scan_results_v2 payload — never deleted here.
--
-- Re-run: ALTER/CREATE IF NOT EXISTS; backfill only fills NULL expiry on rows not yet purged;
-- payment_slips INSERT uses ON CONFLICT DO NOTHING (no duplicate rows).

-- ---------------------------------------------------------------------------
-- scan_uploads: original expiry, thumbnail path, pin, tier, deletion audit
-- ---------------------------------------------------------------------------
ALTER TABLE public.scan_uploads
  ADD COLUMN IF NOT EXISTS original_expires_at timestamptz;

ALTER TABLE public.scan_uploads
  ADD COLUMN IF NOT EXISTS thumbnail_path text;
-- Future: populate when generating long-retention WebP/JPEG; library may prefer this URL over payload objectImageUrl.

ALTER TABLE public.scan_uploads
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE public.scan_uploads
  ADD COLUMN IF NOT EXISTS storage_tier text NOT NULL DEFAULT 'free';

ALTER TABLE public.scan_uploads
  ADD COLUMN IF NOT EXISTS original_deleted_at timestamptz;

COMMENT ON COLUMN public.scan_uploads.original_expires_at IS 'Free tier: delete original object bytes at/after this time if not is_pinned.';
COMMENT ON COLUMN public.scan_uploads.thumbnail_path IS 'Optional long-retention thumbnail in storage (library UI); worker must not delete.';
COMMENT ON COLUMN public.scan_uploads.is_pinned IS 'User pinned full-res original; excluded from free-tier original purge until unpinned.';
COMMENT ON COLUMN public.scan_uploads.storage_tier IS 'free | paid_future — reserved for paid storage plans.';
COMMENT ON COLUMN public.scan_uploads.original_deleted_at IS 'Set when raw original file removed from bucket; payload/thumb unchanged.';

CREATE INDEX IF NOT EXISTS idx_scan_uploads_retention_original
  ON public.scan_uploads (original_expires_at)
  WHERE original_deleted_at IS NULL AND COALESCE(is_pinned, false) = false;

CREATE INDEX IF NOT EXISTS idx_scan_uploads_line_user_pinned
  ON public.scan_uploads (line_user_id)
  WHERE COALESCE(is_pinned, false) = true;

-- Ops / reporting: rows already purged (optional; partial keeps index small).
CREATE INDEX IF NOT EXISTS idx_scan_uploads_original_deleted_at
  ON public.scan_uploads (original_deleted_at DESC)
  WHERE original_deleted_at IS NOT NULL;

-- Backfill expiry for existing rows (30 days from ingest). Skip rows already purged.
UPDATE public.scan_uploads
SET original_expires_at = created_at + interval '30 days'
WHERE original_expires_at IS NULL
  AND original_deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- payment_slips: slip file retention (payment row keeps amount/status/ref)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  slip_hash text,
  slip_expires_at timestamptz NOT NULL,
  slip_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_slips_payment_id UNIQUE (payment_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_slips_expires_pending
  ON public.payment_slips (slip_expires_at)
  WHERE slip_deleted_at IS NULL;

COMMENT ON TABLE public.payment_slips IS 'Slip image retention; payments.* keeps financial truth after raw image deleted.';
COMMENT ON COLUMN public.payment_slips.slip_hash IS 'Optional digest of slip image for audit/dedupe.';
COMMENT ON COLUMN public.payment_slips.slip_expires_at IS 'After this time worker may delete raw slip from storage.';
COMMENT ON COLUMN public.payment_slips.slip_deleted_at IS 'Set when slip object removed from bucket; slip_url on payments may be cleared by app.';

-- Backfill from existing slip uploads (90 days from payment created_at).
INSERT INTO public.payment_slips (payment_id, slip_expires_at)
SELECT id, created_at + interval '90 days'
FROM public.payments
WHERE slip_url IS NOT NULL
  AND trim(slip_url) <> ''
ON CONFLICT (payment_id) DO NOTHING;
